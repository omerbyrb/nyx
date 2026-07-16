//go:build !windows

package main

import "fmt"

func persistReg(_, _ string) (string, error)          { return "", fmt.Errorf("windows only") }
func persistRegRemove(_ string) (string, error)       { return "", fmt.Errorf("windows only") }
func persistService(_, _ string) (string, error)      { return "", fmt.Errorf("windows only") }
func persistServiceRemove(_ string) (string, error)   { return "", fmt.Errorf("windows only") }
func persistTask(_, _, _ string) (string, error)      { return "", fmt.Errorf("windows only") }
func persistTaskRemove(_ string) (string, error)      { return "", fmt.Errorf("windows only") }
func persistStartup(_, _ string) (string, error)      { return "", fmt.Errorf("windows only") }
func persistStartupRemove(_ string) (string, error)   { return "", fmt.Errorf("windows only") }
func persistWMI(_, _ string) (string, error)          { return "", fmt.Errorf("windows only") }
func persistWMIRemove(_ string) (string, error)       { return "", fmt.Errorf("windows only") }
func persistList() (string, error)                    { return "", fmt.Errorf("windows only") }
