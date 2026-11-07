use std::fs;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use tauri::AppHandle;

#[derive(Serialize, Deserialize, Clone)]
pub struct Todo {
    pub text: String,
    pub done: bool,
    /// ISO timestamp when the item was added.
    #[serde(default)]
    pub created: String,
    /// Optional deadline (YYYY-MM-DD) used for ordering.
    #[serde(default)]
    pub deadline: String,
    /// Optional subject, shown inline as `[subject]` and used to group the board.
    #[serde(default)]
    pub subject: String,
    /// Optional longer note. Hidden in the list; shown on the board.
    #[serde(default)]
    pub description: String,
}

fn todo_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(crate::storage::data_dir(app)?.join("todo.md"))
}

/// Parse `todo.md`. Lines that aren't checkbox items are ignored (not lost —
/// they just aren't shown as to-dos), so a hand-edited file never crashes us.
pub(crate) fn parse(content: &str) -> Vec<Todo> {
    let mut todos = Vec::new();
    for line in content.lines() {
        let t = line.trim();
        let rest = t
            .strip_prefix("- [ ] ")
            .map(|r| (false, r))
            .or_else(|| t.strip_prefix("- [x] ").map(|r| (true, r)))
            .or_else(|| t.strip_prefix("- [X] ").map(|r| (true, r)));
        if let Some((done, body)) = rest {
            let (text_part, created, deadline, description) = split_meta(body.trim());
            let (subject, text) = split_subject(&text_part);
            todos.push(Todo {
                text,
                done,
                created,
                deadline,
                subject,
                description,
            });
        }
    }
    todos
}

/// Split a trailing `<!--created|deadline|description-->` marker off the item
/// text. Older markers with fewer fields degrade gracefully.
fn split_meta(body: &str) -> (String, String, String, String) {
    if let Some(start) = body.rfind("<!--") {
        if let Some(end) = body[start..].find("-->") {
            let meta = body[start + 4..start + end].trim();
            let text = body[..start].trim().to_string();
            // splitn(3): description is the remainder, so it may contain '|'.
            let mut parts = meta.splitn(3, '|');
            let created = parts.next().unwrap_or("").trim().to_string();
            let deadline = parts.next().unwrap_or("").trim().to_string();
            let description = decode(parts.next().unwrap_or("").trim());
            return (text, created, deadline, description);
        }
    }
    (body.to_string(), String::new(), String::new(), String::new())
}

/// Pull a leading `[subject]` off the visible text.
fn split_subject(text: &str) -> (String, String) {
    let t = text.trim();
    if t.starts_with('[') {
        if let Some(end) = t.find(']') {
            let subject = t[1..end].trim().to_string();
            let name = t[end + 1..].trim().to_string();
            return (subject, name);
        }
    }
    (String::new(), t.to_string())
}

// Keep the description safe inside an HTML comment (no newlines, no `-->`).
fn encode(s: &str) -> String {
    s.replace('\n', "\\n").replace("-->", "--&gt;")
}
fn decode(s: &str) -> String {
    s.replace("--&gt;", "-->").replace("\\n", "\n")
}

pub(crate) fn render(todos: &[Todo]) -> String {
    let mut out = String::new();
    for t in todos {
        let box_ = if t.done { "x" } else { " " };
        let text = if t.subject.is_empty() {
            t.text.clone()
        } else {
            format!("[{}] {}", t.subject, t.text)
        };
        if t.created.is_empty() && t.deadline.is_empty() && t.description.is_empty() {
            out.push_str(&format!("- [{}] {}\n", box_, text));
        } else {
            out.push_str(&format!(
                "- [{}] {} <!--{}|{}|{}-->\n",
                box_,
                text,
                t.created,
                t.deadline,
                encode(&t.description)
            ));
        }
    }
    out
}

#[tauri::command]
pub fn load_todos(app: AppHandle) -> Result<Vec<Todo>, String> {
    let path = todo_path(&app)?;
    if !path.exists() {
        return Ok(Vec::new());
    }
    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    Ok(parse(&content))
}

#[tauri::command]
pub fn save_todos(app: AppHandle, todos: Vec<Todo>) -> Result<(), String> {
    let path = todo_path(&app)?;
    let mut tmp = path.clone();
    tmp.set_extension("md.tmp");
    fs::write(&tmp, render(&todos)).map_err(|e| e.to_string())?;
    fs::rename(&tmp, &path).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trips() {
        let todos = vec![
            Todo {
                text: "write plan".into(),
                done: false,
                created: "2026-10-23T10:00:00Z".into(),
                deadline: "2026-10-30".into(),
                subject: "Project 1".into(),
                description: "the cheap .dev one".into(),
            },
            Todo {
                text: "ship it".into(),
                done: true,
                created: String::new(),
                deadline: String::new(),
                subject: String::new(),
                description: String::new(),
            },
        ];
        let parsed = parse(&render(&todos));
        assert_eq!(parsed.len(), 2);
        assert_eq!(parsed[0].text, "write plan");
        assert_eq!(parsed[0].subject, "Project 1");
        assert_eq!(parsed[0].description, "the cheap .dev one");
        assert_eq!(parsed[0].deadline, "2026-10-30");
        assert!(!parsed[0].done);
        assert!(parsed[1].done);
        assert_eq!(parsed[1].subject, "");
    }

    #[test]
    fn description_survives_special_chars() {
        let todos = vec![Todo {
            text: "x".into(),
            done: false,
            created: String::new(),
            deadline: String::new(),
            subject: String::new(),
            description: "a | b\nsecond line -->".into(),
        }];
        let parsed = parse(&render(&todos));
        assert_eq!(parsed[0].description, "a | b\nsecond line -->");
    }

    #[test]
    fn tolerates_junk_lines() {
        let input = "- [ ] a\n\nrandom text\n- [X] b\n## heading\n";
        let todos = parse(input);
        assert_eq!(todos.len(), 2);
        assert!(todos[1].done);
    }

    #[test]
    fn splits_subject_prefix() {
        let (subject, name) = split_subject("[Project 1] Buy domain");
        assert_eq!(subject, "Project 1");
        assert_eq!(name, "Buy domain");

        let (subject, name) = split_subject("No subject here");
        assert_eq!(subject, "");
        assert_eq!(name, "No subject here");
    }

    #[test]
    fn legacy_two_field_marker() {
        let todos = parse("- [ ] old <!--2026-10-23T10:00:00Z|2026-11-01-->\n");
        assert_eq!(todos[0].created, "2026-10-23T10:00:00Z");
        assert_eq!(todos[0].deadline, "2026-11-01");
        assert_eq!(todos[0].description, "");
    }
}
