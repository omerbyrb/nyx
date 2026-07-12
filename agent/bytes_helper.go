package main

import "bytes"

// newBytesReader wraps a byte slice in an io.Reader for use with profileDo.
func newBytesReader(b []byte) *bytes.Reader {
	return bytes.NewReader(b)
}
