package internal

import (
	"bytes"
	"fmt"
	"strings"
	"strconv"

	"golang.org/x/net/html"
)

// Table holds the parsed headers and rows from an HTML table.
type Table struct {
	Headers []string
	Rows    [][]string
}

// ParseTables extracts all HTML tables from the page content.
func ParseTables(body []byte) ([]*Table, error) {
	doc, err := html.Parse(bytes.NewReader(body))
	if err != nil {
		return nil, err
	}

	var tables []*Table
	var walk func(*html.Node)
	walk = func(n *html.Node) {
		if n.Type == html.ElementNode && n.Data == "table" {
			t := parseTable(n)
			if len(t.Headers) > 0 && len(t.Rows) > 0 {
				tables = append(tables, t)
			}
			return // don't recurse into nested tables
		}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			walk(c)
		}
	}
	walk(doc)
	return tables, nil
}

func parseTable(n *html.Node) *Table {
	grid := buildGrid(n)
	if len(grid) == 0 {
		return &Table{}
	}

	headers := make([]string, len(grid[0]))
	for i, h := range grid[0] {
		headers[i] = cleanHeader(h)
	}

	var rows [][]string
	for _, raw := range grid[1:] {
		row := make([]string, len(headers))
		for i := range headers {
			if i < len(raw) {
				row[i] = cleanText(raw[i])
			}
		}
		rows = append(rows, row)
	}

	return &Table{Headers: headers, Rows: rows}
}

// buildGrid resolves rowspan/colspan into a 2-D string slice.
func buildGrid(tableNode *html.Node) [][]string {
	// Collect raw rows first.
	type cell struct{ text string; rowspan, colspan int }
	var rawRows [][]cell

	var collectRows func(*html.Node)
	collectRows = func(n *html.Node) {
		if n.Type == html.ElementNode && n.Data == "tr" {
			var cells []cell
			for c := n.FirstChild; c != nil; c = c.NextSibling {
				if c.Type == html.ElementNode && (c.Data == "td" || c.Data == "th") {
					rs, cs := 1, 1
					for _, a := range c.Attr {
						if a.Key == "rowspan" { rs, _ = strconv.Atoi(a.Val) }
						if a.Key == "colspan" { cs, _ = strconv.Atoi(a.Val) }
					}
					if rs < 1 { rs = 1 }
					if cs < 1 { cs = 1 }
					cells = append(cells, cell{text: innerText(c), rowspan: rs, colspan: cs})
				}
			}
			if len(cells) > 0 {
				rawRows = append(rawRows, cells)
			}
			return
		}
		// Don't recurse into nested tables.
		if n.Type == html.ElementNode && n.Data == "table" {
			return
		}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			collectRows(c)
		}
	}
	for c := tableNode.FirstChild; c != nil; c = c.NextSibling {
		collectRows(c)
	}

	if len(rawRows) == 0 {
		return nil
	}

	// Figure out max columns.
	maxCols := 0
	for _, row := range rawRows {
		w := 0
		for _, c := range row {
			w += c.colspan
		}
		if w > maxCols {
			maxCols = w
		}
	}

	grid := make([][]string, len(rawRows))
	for i := range grid {
		grid[i] = make([]string, maxCols)
	}

	type span struct{ text string; remaining int }
	pending := make([]span, maxCols)

	for ri, row := range rawRows {
		ci := 0
		for col := 0; col < maxCols; col++ {
			if pending[col].remaining > 0 {
				grid[ri][col] = pending[col].text
				pending[col].remaining--
				continue
			}
			if ci >= len(row) {
				continue
			}
			c := row[ci]
			ci++
			for s := 0; s < c.colspan && col+s < maxCols; s++ {
				grid[ri][col+s] = c.text
				if c.rowspan > 1 {
					pending[col+s] = span{text: c.text, remaining: c.rowspan - 1}
				}
			}
			col += c.colspan - 1
		}
	}

	return grid
}

func innerText(n *html.Node) string {
	var b strings.Builder
	var walk func(*html.Node)
	walk = func(node *html.Node) {
		if node.Type == html.ElementNode && (node.Data == "sup" || node.Data == "script" || node.Data == "style") {
			return
		}
		if node.Type == html.TextNode {
			b.WriteString(node.Data)
		}
		for c := node.FirstChild; c != nil; c = c.NextSibling {
			walk(c)
		}
	}
	walk(n)
	return b.String()
}

func cleanText(s string) string {
	s = strings.ReplaceAll(s, "\u00a0", " ")
	s = strings.ReplaceAll(s, "\n", " ")
	s = strings.ReplaceAll(s, "\t", " ")
	for strings.Contains(s, "  ") {
		s = strings.ReplaceAll(s, "  ", " ")
	}
	return strings.TrimSpace(s)
}

func cleanHeader(s string) string {
	s = cleanText(s)
	var b strings.Builder
	for _, r := range strings.ToLower(s) {
		if r >= 'a' && r <= 'z' || r >= '0' && r <= '9' || r == '_' {
			b.WriteRune(r)
		} else if r == ' ' || r == '-' || r == '/' {
			b.WriteRune('_')
		}
	}
	result := strings.Trim(b.String(), "_")
	if result == "" {
		result = fmt.Sprintf("col")
	}
	return result
}
