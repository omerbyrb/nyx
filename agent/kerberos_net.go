//go:build windows

package main

import "net"

// dialNetTCP opens a TCP connection using Go's stdlib net package.
// Separated into its own file so the net import is clearly scoped.
func dialNetTCP(addr string) (interface {
	Read([]byte) (int, error)
	Write([]byte) (int, error)
	Close() error
}, error) {
	return net.Dial("tcp", addr)
}
