package internal

import (
	"crypto/sha256"
	"database/sql"
	"fmt"
	"strings"

	_ "github.com/go-sql-driver/mysql"
)

// OpenDB opens and pings a MySQL connection.
func OpenDB(dsn string) (*sql.DB, error) {
	db, err := sql.Open("mysql", dsn)
	if err != nil {
		return nil, err
	}
	if err := db.Ping(); err != nil {
		return nil, fmt.Errorf("ping failed: %w", err)
	}
	return db, nil
}

// CreateTable creates the table if it doesn't already exist.
// A `_hash` column is added for idempotent inserts.
func CreateTable(db *sql.DB, table string, headers []string, types []string) error {
	var cols []string
	for i, h := range headers {
		cols = append(cols, fmt.Sprintf("`%s` %s", h, types[i]))
	}
	cols = append(cols, "`_hash` CHAR(64) UNIQUE")

	ddl := fmt.Sprintf("CREATE TABLE IF NOT EXISTS `%s` (%s)", table, strings.Join(cols, ", "))
	_, err := db.Exec(ddl)
	return err
}

// InsertRows batch-inserts rows using INSERT IGNORE (idempotent).
// Returns (inserted, skipped, error) where skipped = len(rows) - inserted.
func InsertRows(db *sql.DB, table string, headers []string, rows [][]string) (inserted int, skipped int, err error) {
	if len(rows) == 0 {
		return 0, 0, nil
	}

	placeholders := "(" + strings.Repeat("?,", len(headers)) + "?)"
	query := fmt.Sprintf("INSERT IGNORE INTO `%s` (`%s`, `_hash`) VALUES %s",
		table,
		strings.Join(headers, "`,`"),
		placeholders,
	)

	tx, txErr := db.Begin()
	if txErr != nil {
		return 0, 0, txErr
	}
	defer tx.Rollback()

	stmt, stmtErr := tx.Prepare(query)
	if stmtErr != nil {
		return 0, 0, stmtErr
	}
	defer stmt.Close()

	for _, row := range rows {
		args := make([]interface{}, len(headers)+1)
		for i := range headers {
			if i < len(row) {
				args[i] = row[i]
			} else {
				args[i] = ""
			}
		}
		args[len(headers)] = rowHash(row)

		res, execErr := stmt.Exec(args...)
		if execErr != nil {
			return inserted, skipped, fmt.Errorf("insert failed: %w", execErr)
		}
		n, _ := res.RowsAffected()
		if n > 0 {
			inserted++
		} else {
			skipped++
		}
	}

	return inserted, skipped, tx.Commit()
}

func rowHash(row []string) string {
	h := sha256.Sum256([]byte(strings.Join(row, "|")))
	return fmt.Sprintf("%x", h)
}
