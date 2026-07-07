//go:build !windows

package main

import "fmt"

func hollowProcess(targetExe string, shellcode []byte) (string, error) {
	return "", fmt.Errorf("Windows-only")
}

func hollowPE(targetExe string, peBytes []byte) (string, error) {
	return "", fmt.Errorf("Windows-only")
}
