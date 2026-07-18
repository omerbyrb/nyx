//go:build !windows

package main

import "fmt"

func sandboxCheck() (int, []string)          { return 0, nil }
func antiSandbox(_ bool) (string, error)     { return "", fmt.Errorf("windows only") }
