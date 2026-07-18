//go:build !windows

package main

import "fmt"

func unhookNtdll() (string, error) { return "", fmt.Errorf("windows only") }
func unhookAll() (string, error)   { return "", fmt.Errorf("windows only") }
