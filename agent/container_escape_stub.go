//go:build windows

package main

func containerCheck() (string, string) {
	return "Container escape: not applicable on Windows (use win-token-* for privilege ops)", "failed"
}

func dockerEscape(_ string) (string, string) {
	return "Docker escape: not applicable on Windows", "failed"
}

func k8sSAToken() (string, string) {
	return "K8s SA token: not applicable on Windows", "failed"
}

func k8sEnumPods() (string, string) {
	return "K8s pod enum: not applicable on Windows", "failed"
}
