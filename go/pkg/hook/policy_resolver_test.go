package hook

import (
	"errors"
	"os"
	"path/filepath"
	"testing"
)

func TestFindPolicyFileInCurrentDir(t *testing.T) {
	dir := t.TempDir()
	policyPath := filepath.Join(dir, "agentguard.yaml")
	os.WriteFile(policyPath, []byte("id: test\nname: Test\nrules: []\n"), 0644)

	// Change to the temp dir so FindPolicyFile walks from there
	origDir, _ := os.Getwd()
	os.Chdir(dir)
	defer os.Chdir(origDir)

	// Clear env to avoid interference
	os.Unsetenv("AGENTGUARD_POLICY")

	found, err := FindPolicyFile()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if found != policyPath {
		t.Errorf("expected %s, got %s", policyPath, found)
	}
}

func TestFindPolicyFileWalkUp(t *testing.T) {
	// Create a nested directory structure:
	// tmpdir/agentguard.yaml
	// tmpdir/sub/deep/
	dir := t.TempDir()
	policyPath := filepath.Join(dir, "agentguard.yaml")
	os.WriteFile(policyPath, []byte("id: test\nname: Test\nrules: []\n"), 0644)

	deepDir := filepath.Join(dir, "sub", "deep")
	os.MkdirAll(deepDir, 0755)

	origDir, _ := os.Getwd()
	os.Chdir(deepDir)
	defer os.Chdir(origDir)

	os.Unsetenv("AGENTGUARD_POLICY")

	found, err := FindPolicyFile()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if found != policyPath {
		t.Errorf("expected %s, got %s", policyPath, found)
	}
}

func TestFindPolicyFileYmlExtension(t *testing.T) {
	dir := t.TempDir()
	policyPath := filepath.Join(dir, "agentguard.yml")
	os.WriteFile(policyPath, []byte("id: test\nname: Test\nrules: []\n"), 0644)

	origDir, _ := os.Getwd()
	os.Chdir(dir)
	defer os.Chdir(origDir)

	os.Unsetenv("AGENTGUARD_POLICY")

	found, err := FindPolicyFile()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if found != policyPath {
		t.Errorf("expected %s, got %s", policyPath, found)
	}
}

func TestFindPolicyFileEnvVarOverride(t *testing.T) {
	dir := t.TempDir()
	envPolicy := filepath.Join(dir, "custom-policy.yaml")
	os.WriteFile(envPolicy, []byte("id: custom\nname: Custom\nrules: []\n"), 0644)

	// Also create a policy in cwd to prove env var takes precedence
	cwdPolicy := filepath.Join(dir, "agentguard.yaml")
	os.WriteFile(cwdPolicy, []byte("id: cwd\nname: CWD\nrules: []\n"), 0644)

	origDir, _ := os.Getwd()
	os.Chdir(dir)
	defer os.Chdir(origDir)

	os.Setenv("AGENTGUARD_POLICY", envPolicy)
	defer os.Unsetenv("AGENTGUARD_POLICY")

	found, err := FindPolicyFile()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if found != envPolicy {
		t.Errorf("expected env override %s, got %s", envPolicy, found)
	}
}

func TestFindPolicyFileEnvVarMissingFile(t *testing.T) {
	os.Setenv("AGENTGUARD_POLICY", "/nonexistent/policy.yaml")
	defer os.Unsetenv("AGENTGUARD_POLICY")

	_, err := FindPolicyFile()
	if err == nil {
		t.Error("expected error when AGENTGUARD_POLICY points to missing file")
	}
}

func TestFindPolicyFileNotFound(t *testing.T) {
	// Use an empty temp dir with no policy files anywhere
	dir := t.TempDir()

	origDir, _ := os.Getwd()
	os.Chdir(dir)
	defer os.Chdir(origDir)

	os.Unsetenv("AGENTGUARD_POLICY")

	_, err := FindPolicyFile()
	if !errors.Is(err, ErrPolicyNotFound) {
		t.Errorf("expected ErrPolicyNotFound, got %v", err)
	}
}

func TestFindPolicyFilePreferYamlOverYml(t *testing.T) {
	dir := t.TempDir()
	yamlPath := filepath.Join(dir, "agentguard.yaml")
	ymlPath := filepath.Join(dir, "agentguard.yml")
	os.WriteFile(yamlPath, []byte("id: yaml\nname: YAML\nrules: []\n"), 0644)
	os.WriteFile(ymlPath, []byte("id: yml\nname: YML\nrules: []\n"), 0644)

	origDir, _ := os.Getwd()
	os.Chdir(dir)
	defer os.Chdir(origDir)

	os.Unsetenv("AGENTGUARD_POLICY")

	found, err := FindPolicyFile()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	// .yaml should be found first since it's first in defaultPolicyNames
	if found != yamlPath {
		t.Errorf("expected .yaml to take precedence, got %s", found)
	}
}
