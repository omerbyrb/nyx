//go:build !windows

package main

import "fmt"

func lsassDump(_ string) (string, error)                     { return "", fmt.Errorf("windows only") }
func passTheHash(_, _, _, _ string) (string, error)          { return "", fmt.Errorf("windows only") }
func passTheTicket(_ string) (string, error)                 { return "", fmt.Errorf("windows only") }
func dcsyncLocal(_ string) (string, error)                   { return "", fmt.Errorf("windows only") }
func dcsyncDomain(_ string) (string, error)                  { return "", fmt.Errorf("windows only") }
