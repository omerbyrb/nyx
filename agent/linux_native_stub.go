//go:build !linux

package main

import "fmt"

func linuxPersistLD(_ string) (string, error)              { return "", fmt.Errorf("linux only") }
func linuxPersistBashrc(_ string) (string, error)          { return "", fmt.Errorf("linux only") }
func linuxPersistSystemd(_, _ string) (string, error)      { return "", fmt.Errorf("linux only") }
func linuxPersistCronD(_, _, _ string) (string, error)     { return "", fmt.Errorf("linux only") }
func linuxPersistProfileD(_, _ string) (string, error)     { return "", fmt.Errorf("linux only") }
func linuxPersistList() (string, error)                    { return "", fmt.Errorf("linux only") }
func linuxPersistRemove(_, _ string) (string, error)       { return "", fmt.Errorf("linux only") }
func linuxPrivescCheck() (string, error)                   { return "", fmt.Errorf("linux only") }
