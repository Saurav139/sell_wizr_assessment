package internal

import (
	"fmt"
	"io"
	"net/http"
	"time"
)

// Fetch downloads the URL, retrying up to maxRetries times on failure.
func Fetch(url string, maxRetries int) ([]byte, error) {
	client := &http.Client{Timeout: 30 * time.Second}

	for i := 0; i <= maxRetries; i++ {
		if i > 0 {
			time.Sleep(time.Duration(i) * 2 * time.Second)
		}

		req, _ := http.NewRequest("GET", url, nil)
		req.Header.Set("User-Agent", "Mozilla/5.0 (compatible; TableStreamer/1.0)")

		resp, err := client.Do(req)
		if err != nil {
			fmt.Printf("attempt %d failed: %v\n", i+1, err)
			continue
		}
		defer resp.Body.Close()

		if resp.StatusCode != 200 {
			fmt.Printf("attempt %d: status %d\n", i+1, resp.StatusCode)
			continue
		}

		return io.ReadAll(resp.Body)
	}

	return nil, fmt.Errorf("all %d attempts failed for %s", maxRetries+1, url)
}
