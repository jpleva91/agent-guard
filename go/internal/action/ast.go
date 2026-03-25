// Package action provides command scanning for git, github, and destructive patterns.
// This file implements a lightweight shell command AST parser (KE-5).
package action

import (
	"strings"
	"unicode"
)

// CommandAST is the top-level AST for a parsed shell command string.
type CommandAST struct {
	Commands []Command
}

// Command represents a single command in a shell pipeline or compound expression.
type Command struct {
	Name      string     // The executable name (e.g., "git", "gh", "rm")
	Args      []string   // Arguments to the command
	Operator  string     // Operator that follows this command: "", "&&", "||", ";", "|"
	Redirects []Redirect // I/O redirects attached to this command
}

// Redirect represents an I/O redirection (e.g., > file, 2>/dev/null, >> log).
type Redirect struct {
	Fd     int    // 0=stdin, 1=stdout, 2=stderr
	Target string // Target file path
	Append bool   // true for >> (append mode)
}

// FullCommand returns the reconstructed command string (Name + Args).
func (c *Command) FullCommand() string {
	if c.Name == "" {
		return ""
	}
	if len(c.Args) == 0 {
		return c.Name
	}
	return c.Name + " " + strings.Join(c.Args, " ")
}

// IsCompound returns true if the AST contains more than one command
// (joined by &&, ||, ;, or |).
func (a *CommandAST) IsCompound() bool {
	return len(a.Commands) > 1
}

// containsCompoundOperator quickly checks whether a string contains
// shell compound operators without a full parse.
func containsCompoundOperator(s string) bool {
	for i := 0; i < len(s); i++ {
		switch s[i] {
		case '&':
			if i+1 < len(s) && s[i+1] == '&' {
				return true
			}
		case '|':
			return true
		case ';':
			return true
		}
	}
	return false
}

// ParseShellCommand parses a shell command string into a structured AST.
// It handles simple commands, compound commands (&&, ||, ;), pipes,
// redirects, quoted strings, variable expansion, and subshells.
// This is a lightweight parser optimized for the commands that AI agents produce,
// not a full POSIX shell parser.
func ParseShellCommand(input string) *CommandAST {
	input = strings.TrimSpace(input)
	if input == "" {
		return &CommandAST{}
	}

	ast := &CommandAST{}
	tokens := tokenize(input)
	if len(tokens) == 0 {
		return ast
	}

	ast.Commands = buildCommands(tokens)
	return ast
}

// token types used during parsing
const (
	tokWord     = iota // a regular word/argument
	tokAnd             // &&
	tokOr              // ||
	tokSemi            // ;
	tokPipe            // |
	tokRedirOut        // >
	tokRedirApp        // >>
	tokRedirIn         // <
)

type token struct {
	kind  int
	value string
}

// tokenize splits a shell command string into tokens, respecting quotes,
// escapes, variable expansions, and subshells.
func tokenize(input string) []token {
	var tokens []token
	runes := []rune(input)
	n := len(runes)
	i := 0

	for i < n {
		// Skip whitespace
		if unicode.IsSpace(runes[i]) {
			i++
			continue
		}

		// Check for operators
		if runes[i] == '&' && i+1 < n && runes[i+1] == '&' {
			tokens = append(tokens, token{kind: tokAnd, value: "&&"})
			i += 2
			continue
		}
		if runes[i] == '|' && i+1 < n && runes[i+1] == '|' {
			tokens = append(tokens, token{kind: tokOr, value: "||"})
			i += 2
			continue
		}
		if runes[i] == '|' {
			tokens = append(tokens, token{kind: tokPipe, value: "|"})
			i++
			continue
		}
		if runes[i] == ';' {
			tokens = append(tokens, token{kind: tokSemi, value: ";"})
			i++
			continue
		}

		// Check for redirects: handle fd prefix (e.g., 2>)
		if isRedirectStart(runes, i, n) {
			tok, newI := parseRedirect(runes, i, n)
			tokens = append(tokens, tok)
			i = newI
			continue
		}

		// Regular word (may include quotes, escapes, variable expansion, subshells)
		word, newI := parseWord(runes, i, n)
		if word != "" {
			tokens = append(tokens, token{kind: tokWord, value: word})
		}
		i = newI
	}

	return tokens
}

// isRedirectStart checks if position i starts a redirect operator.
func isRedirectStart(runes []rune, i, n int) bool {
	if runes[i] == '>' {
		return true
	}
	if runes[i] == '<' {
		return true
	}
	// Check for fd redirect: digit followed by >
	if i+1 < n && runes[i] >= '0' && runes[i] <= '9' && runes[i+1] == '>' {
		return true
	}
	return false
}

// parseRedirect parses a redirect token starting at position i.
func parseRedirect(runes []rune, i, n int) (token, int) {
	var val strings.Builder
	// Collect optional fd digit
	if runes[i] >= '0' && runes[i] <= '9' && i+1 < n && runes[i+1] == '>' {
		val.WriteRune(runes[i])
		i++
	}
	if runes[i] == '<' {
		val.WriteRune('<')
		return token{kind: tokRedirIn, value: val.String()}, i + 1
	}
	// > or >>
	val.WriteRune('>')
	i++
	if i < n && runes[i] == '>' {
		val.WriteRune('>')
		i++
		return token{kind: tokRedirApp, value: val.String()}, i
	}
	return token{kind: tokRedirOut, value: val.String()}, i
}

// parseWord parses a word token starting at position i, handling quotes,
// escapes, variable expansion ($VAR, ${VAR}), and command substitution ($(cmd), `cmd`).
func parseWord(runes []rune, i, n int) (string, int) {
	var buf strings.Builder

	for i < n {
		ch := runes[i]

		// End of word on unquoted whitespace or operator
		if unicode.IsSpace(ch) {
			break
		}
		if ch == '&' && i+1 < n && runes[i+1] == '&' {
			break
		}
		if ch == '|' {
			break
		}
		if ch == ';' {
			break
		}
		// Redirect operators end a word (unless preceded by fd digit which would be part of redirect)
		if ch == '>' || ch == '<' {
			break
		}
		// Check for digit+> redirect which should end the word
		if ch >= '0' && ch <= '9' && i+1 < n && runes[i+1] == '>' {
			// Only break if this is the start of the word (fd redirect)
			if buf.Len() == 0 {
				break
			}
			// Otherwise it's just a digit in a word
		}

		// Escape character
		if ch == '\\' && i+1 < n {
			buf.WriteRune(runes[i+1])
			i += 2
			continue
		}

		// Single-quoted string: preserve literally
		if ch == '\'' {
			i++
			for i < n && runes[i] != '\'' {
				buf.WriteRune(runes[i])
				i++
			}
			if i < n {
				i++ // skip closing quote
			}
			continue
		}

		// Double-quoted string: allow variable expansion
		if ch == '"' {
			i++
			for i < n && runes[i] != '"' {
				if runes[i] == '\\' && i+1 < n {
					buf.WriteRune(runes[i+1])
					i += 2
					continue
				}
				buf.WriteRune(runes[i])
				i++
			}
			if i < n {
				i++ // skip closing quote
			}
			continue
		}

		// Command substitution: $(...)
		if ch == '$' && i+1 < n && runes[i+1] == '(' {
			sub, newI := parseSubshell(runes, i, n)
			buf.WriteString(sub)
			i = newI
			continue
		}

		// Backtick command substitution: `...`
		if ch == '`' {
			buf.WriteRune('`')
			i++
			for i < n && runes[i] != '`' {
				buf.WriteRune(runes[i])
				i++
			}
			if i < n {
				buf.WriteRune('`')
				i++ // skip closing backtick
			}
			continue
		}

		// Variable expansion: ${...} or $VAR
		if ch == '$' && i+1 < n {
			if runes[i+1] == '{' {
				sub, newI := parseBraceVar(runes, i, n)
				buf.WriteString(sub)
				i = newI
				continue
			}
			// Simple $VAR
			buf.WriteRune('$')
			i++
			for i < n && (unicode.IsLetter(runes[i]) || unicode.IsDigit(runes[i]) || runes[i] == '_') {
				buf.WriteRune(runes[i])
				i++
			}
			continue
		}

		// Regular character
		buf.WriteRune(ch)
		i++
	}

	return buf.String(), i
}

// parseSubshell parses a $(...) command substitution, tracking nested parentheses.
func parseSubshell(runes []rune, i, n int) (string, int) {
	var buf strings.Builder
	buf.WriteRune('$')
	buf.WriteRune('(')
	i += 2 // skip $(
	depth := 1
	for i < n && depth > 0 {
		if runes[i] == '(' {
			depth++
		} else if runes[i] == ')' {
			depth--
			if depth == 0 {
				buf.WriteRune(')')
				i++
				break
			}
		}
		buf.WriteRune(runes[i])
		i++
	}
	return buf.String(), i
}

// parseBraceVar parses a ${...} variable expansion.
func parseBraceVar(runes []rune, i, n int) (string, int) {
	var buf strings.Builder
	buf.WriteRune('$')
	buf.WriteRune('{')
	i += 2 // skip ${
	for i < n && runes[i] != '}' {
		buf.WriteRune(runes[i])
		i++
	}
	if i < n {
		buf.WriteRune('}')
		i++ // skip }
	}
	return buf.String(), i
}

// buildCommands groups tokens into Command structs separated by operators.
func buildCommands(tokens []token) []Command {
	var commands []Command
	var currentWords []string
	var currentRedirects []Redirect

	flushCommand := func(op string) {
		if len(currentWords) == 0 && len(currentRedirects) == 0 {
			return
		}
		cmd := Command{Operator: op, Redirects: currentRedirects}
		if len(currentWords) > 0 {
			cmd.Name = currentWords[0]
			if len(currentWords) > 1 {
				cmd.Args = currentWords[1:]
			}
		}
		commands = append(commands, cmd)
		currentWords = nil
		currentRedirects = nil
	}

	for i := 0; i < len(tokens); i++ {
		t := tokens[i]
		switch t.kind {
		case tokAnd:
			flushCommand("&&")
		case tokOr:
			flushCommand("||")
		case tokSemi:
			flushCommand(";")
		case tokPipe:
			flushCommand("|")
		case tokRedirOut, tokRedirApp, tokRedirIn:
			rd := parseRedirectToken(t, tokens, &i)
			currentRedirects = append(currentRedirects, rd)
		case tokWord:
			currentWords = append(currentWords, t.value)
		}
	}

	// Flush the last command (no trailing operator)
	flushCommand("")

	return commands
}

// parseRedirectToken converts a redirect token and the following target token
// into a Redirect struct.
func parseRedirectToken(t token, tokens []token, idx *int) Redirect {
	rd := Redirect{Fd: 1} // default to stdout
	val := t.value

	// Parse fd prefix
	if len(val) > 0 && val[0] >= '0' && val[0] <= '9' {
		rd.Fd = int(val[0] - '0')
		val = val[1:]
	}

	switch {
	case val == ">>":
		rd.Append = true
	case val == "<":
		rd.Fd = 0 // stdin
	}

	// Next token is the target
	if *idx+1 < len(tokens) && tokens[*idx+1].kind == tokWord {
		*idx++
		rd.Target = tokens[*idx].value
	}

	return rd
}
