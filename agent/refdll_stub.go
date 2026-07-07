//go:build !windows

package main

import "fmt"

func reflectiveDLLLoad(dllBytes []byte) (string, error) {
	return "", fmt.Errorf("Windows-only")
}
