//go:build !windows

package main

import "fmt"

func kerbRoast(spn string) (string, error)              { return "", fmt.Errorf("Windows-only") }
func kerbList() (string, error)                         { return "", fmt.Errorf("Windows-only") }
func asRepRoast(username, domain, dc string) (string, error) { return "", fmt.Errorf("Windows-only") }
