import React, { useState, useRef, useEffect } from 'react';
import { ONTARIO_COURSES } from '../data/courses';

interface CourseInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export default function CourseInput({ value, onChange, placeholder, className }: CourseInputProps) {
  const [inputValue, setInputValue] = useState(value);
  const [showDropdown, setShowDropdown] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setInputValue(value);
  }, [value]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
        // Force valid value on blur
        if (inputValue && !ONTARIO_COURSES.includes(inputValue.toUpperCase())) {
          setInputValue('');
          onChange('');
        }
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [inputValue, onChange]);

  const filteredCourses = ONTARIO_COURSES.filter(course => 
    course.toLowerCase().startsWith(inputValue.toLowerCase())
  );

  const handleSelect = (course: string) => {
    setInputValue(course);
    onChange(course);
    setShowDropdown(false);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value.toUpperCase());
    onChange(e.target.value.toUpperCase());
    setShowDropdown(true);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && filteredCourses.length > 0) {
      handleSelect(filteredCourses[0]);
    }
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    // If the focus is moving to a dropdown item, do nothing
    if (wrapperRef.current?.contains(e.relatedTarget as Node)) {
      return;
    }
    
    // Otherwise, enforce valid course on blur (e.g. via Tab key)
    if (inputValue && !ONTARIO_COURSES.includes(inputValue.toUpperCase())) {
      setInputValue('');
      onChange('');
    }
  };

  return (
    <div className="relative" ref={wrapperRef}>
      <input
        type="text"
        value={inputValue}
        onChange={handleInputChange}
        onFocus={() => setShowDropdown(true)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        placeholder={placeholder || "e.g. SNC1W"}
        className={className}
      />
      {showDropdown && inputValue && (
        <div className="absolute z-50 w-full mt-1 bg-white border-2 border-slate-200 rounded-xl shadow-lg max-h-60 overflow-auto">
          {filteredCourses.length > 0 ? (
            filteredCourses.map(course => (
              <button
                key={course}
                onClick={() => handleSelect(course)}
                className="w-full text-left px-4 py-2 hover:bg-slate-100 font-bold text-slate-700 transition-colors"
                type="button"
              >
                {course}
              </button>
            ))
          ) : (
            <div className="px-4 py-2 text-slate-500 italic text-sm">
              Invalid course code
            </div>
          )}
        </div>
      )}
    </div>
  );
}
