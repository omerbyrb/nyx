//go:build !windows

package main

import "fmt"

func loadBOF(coff []byte, args []byte) (string, error) {
	return "", fmt.Errorf("Windows-only")
}

func PackBOFArgs(args ...interface{}) []byte { return nil }
