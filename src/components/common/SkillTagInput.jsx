import React, { useState, useRef } from "react";
import { parseSkillsToArray } from "../../services/normalization.js";
import "./SkillTagInput.css";

/**
 * SkillTagInput
 * Structured skill tag / chip entry component.
 * Allows employers to:
 *   - Type a skill and press Enter, Tab, or comma to add a tag.
 *   - Click the "×" remove button on individual tags.
 *   - Press Backspace on an empty input to remove the last tag.
 *   - Paste comma-, newline-, or semicolon-delimited lists which automatically parse into discrete chips.
 *
 * @param {Array<string>|string} skills - Array of skill strings or comma-separated string
 * @param {Function} onChange - Callback returning string[] of current skills
 * @param {string} placeholder - Placeholder text for input
 * @param {boolean} disabled - Disable input interactions
 */
export default function SkillTagInput({
  skills = [],
  onChange,
  placeholder = "Type a skill and press Enter or comma...",
  disabled = false,
  id,
  name
}) {
  const [inputValue, setInputValue] = useState("");
  const inputRef = useRef(null);

  // Normalize skills prop into array
  const currentSkills = Array.isArray(skills)
    ? skills
    : parseSkillsToArray(skills);

  function addSkill(skillText) {
    const parsed = parseSkillsToArray(skillText);
    if (!parsed || parsed.length === 0) return;

    const existingLower = new Set(currentSkills.map(s => s.toLowerCase()));
    const newItems = parsed.filter(s => !existingLower.has(s.toLowerCase()));

    if (newItems.length > 0 && onChange) {
      onChange([...currentSkills, ...newItems]);
    }
  }

  function removeSkill(indexToRemove) {
    if (disabled || !onChange) return;
    const updated = currentSkills.filter((_, idx) => idx !== indexToRemove);
    onChange(updated);
  }

  function handleKeyDown(e) {
    if (disabled) return;

    if (e.key === "Enter" || e.key === "," || e.key === "Tab") {
      // Prevent form submit on Enter or Tab away before adding
      if (inputValue.trim()) {
        e.preventDefault();
        addSkill(inputValue);
        setInputValue("");
      } else if (e.key === ",") {
        e.preventDefault();
      }
    } else if (e.key === "Backspace" && !inputValue && currentSkills.length > 0) {
      e.preventDefault();
      removeSkill(currentSkills.length - 1);
    }
  }

  function handlePaste(e) {
    if (disabled) return;
    const pastedText = e.clipboardData.getData("text");
    if (!pastedText) return;

    // Check if pasted content has multiple skills
    const parsed = parseSkillsToArray(pastedText);
    if (parsed.length > 0) {
      e.preventDefault();
      addSkill(pastedText);
      setInputValue("");
    }
  }

  function handleContainerClick() {
    if (!disabled && inputRef.current) {
      inputRef.current.focus();
    }
  }

  function handleBlur() {
    if (inputValue.trim()) {
      addSkill(inputValue);
      setInputValue("");
    }
  }

  return (
    <div
      className={`skill-tag-input-container ${disabled ? "disabled" : ""}`}
      onClick={handleContainerClick}
    >
      {currentSkills.map((skill, index) => (
        <span key={`${skill}-${index}`} className="skill-chip">
          {skill}
          {!disabled && (
            <button
              type="button"
              className="skill-chip-remove"
              onClick={(e) => {
                e.stopPropagation();
                removeSkill(index);
              }}
              title={`Remove ${skill}`}
              aria-label={`Remove ${skill}`}
            >
              ×
            </button>
          )}
        </span>
      ))}
      <input
        ref={inputRef}
        type="text"
        id={id}
        name={name}
        className="skill-tag-inner-input"
        value={inputValue}
        onChange={(e) => {
          // If user types a comma, trigger add
          const val = e.target.value;
          if (val.includes(",")) {
            addSkill(val);
            setInputValue("");
          } else {
            setInputValue(val);
          }
        }}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        onBlur={handleBlur}
        placeholder={currentSkills.length === 0 ? placeholder : "Add another skill..."}
        disabled={disabled}
      />
    </div>
  );
}
