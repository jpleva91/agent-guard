package hook

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// Lesson captures a denied action for agent learning (Educate mode).
type Lesson struct {
	Action           string `json:"action"`
	Tool             string `json:"tool"`
	Target           string `json:"target"`
	Rule             string `json:"rule"`
	Reason           string `json:"reason"`
	Suggestion       string `json:"suggestion,omitempty"`
	CorrectedCommand string `json:"correctedCommand,omitempty"`
	AgentID          string `json:"agentId"`
	Squad            string `json:"squad,omitempty"`
	Timestamp        string `json:"timestamp"`
	Count            int    `json:"count"`
}

// LessonStore holds lessons for a squad.
type LessonStore struct {
	Lessons []Lesson `json:"lessons"`
}

func lessonDir(projectRoot string) string {
	return filepath.Join(projectRoot, ".agentguard", "lessons")
}

func lessonPath(projectRoot, squad string) string {
	if squad == "" {
		squad = "default"
	}
	return filepath.Join(lessonDir(projectRoot), squad+".json")
}

// CaptureLesson records a denial as a lesson for future learning.
func CaptureLesson(projectRoot string, lesson Lesson) {
	if projectRoot == "" {
		projectRoot = "."
	}
	squad := lesson.Squad
	if squad == "" {
		squad = "default"
	}

	store := readLessonStore(projectRoot, squad)
	store = mergeLesson(store, lesson)
	writeLessonStore(projectRoot, squad, store)
}

func readLessonStore(projectRoot, squad string) LessonStore {
	path := lessonPath(projectRoot, squad)
	data, err := os.ReadFile(path)
	if err != nil {
		return LessonStore{}
	}
	var store LessonStore
	json.Unmarshal(data, &store)
	return store
}

func mergeLesson(store LessonStore, lesson Lesson) LessonStore {
	// Deduplicate: if same action+rule exists, increment count
	for i, existing := range store.Lessons {
		if existing.Action == lesson.Action && existing.Rule == lesson.Rule {
			store.Lessons[i].Count++
			store.Lessons[i].Timestamp = lesson.Timestamp
			return store
		}
	}
	lesson.Count = 1
	if lesson.Timestamp == "" {
		lesson.Timestamp = time.Now().UTC().Format(time.RFC3339)
	}
	store.Lessons = append(store.Lessons, lesson)
	return store
}

func writeLessonStore(projectRoot, squad string, store LessonStore) {
	dir := lessonDir(projectRoot)
	os.MkdirAll(dir, 0o755)
	data, err := json.MarshalIndent(store, "", "  ")
	if err != nil {
		return
	}
	os.WriteFile(lessonPath(projectRoot, squad), data, 0o644)
}

// SquadFromIdentity extracts the squad name from an identity string.
// Format: driver:model:role or driver:model:squad:role
func SquadFromIdentity(identity string) string {
	parts := strings.Split(identity, ":")
	if len(parts) >= 4 {
		return parts[2] // driver:model:squad:role
	}
	return "default"
}
