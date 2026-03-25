// Package main provides the AgentGuard Go kernel CLI.
package main

import (
	"fmt"
	"os"
)

func main() {
	if len(os.Args) < 2 {
		fmt.Fprintln(os.Stderr, "Usage: agentguard <normalize|evaluate>")
		os.Exit(1)
	}
	switch os.Args[1] {
	case "normalize":
		fmt.Fprintln(os.Stderr, "normalize: not yet implemented")
		os.Exit(1)
	case "evaluate":
		fmt.Fprintln(os.Stderr, "evaluate: not yet implemented")
		os.Exit(1)
	default:
		fmt.Fprintf(os.Stderr, "unknown command: %s\n", os.Args[1])
		os.Exit(1)
	}
}
