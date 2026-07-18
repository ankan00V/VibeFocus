import subprocess
import re

def get_diff_hunks():
    # Run git diff -U0 styles.css
    res = subprocess.run(["git", "diff", "-U0", "styles.css"], capture_output=True, text=True, cwd="/Users/ankanghosh/Desktop/projects/timer timer")
    if res.returncode != 0:
        print(f"Error running git diff: {res.stderr}")
        return []
    
    hunks = []
    # Parse hunks
    # Format of diff headers: @@ -old_start,old_count +new_start,new_count @@
    pattern = re.compile(r"^@@\s+-\d+(?:,\d+)?\s+\+(\d+)(?:,(\d+))?\s+@@")
    lines = res.stdout.splitlines()
    for line in lines:
        match = pattern.match(line)
        if match:
            new_start = int(match.group(1))
            new_count = int(match.group(2)) if match.group(2) else 1
            hunks.append((new_start, new_count))
    return hunks

def parse_css_media_queries(file_path):
    with open(file_path, 'r') as f:
        content = f.read()
    
    # We want to trace the active media query at each character/line index
    # We can scan the file character by character to keep track of nested braces and media queries
    lines = content.splitlines()
    line_media = []
    
    current_media_stack = []
    brace_depth = 0
    # Keep track of active media blocks
    chars = list(content)
    
    # Let's map each character to its active media query stack
    char_media = [None] * len(chars)
    i = 0
    
    # A simple parser
    brace_stack = [] # stack of ('media', media_index) or ('other', index)
    
    while i < len(chars):
        if chars[i] == '@':
            # check if it starts a media query
            chunk = "".join(chars[i:i+100])
            m = re.match(r"^@media\s*([^{]+)", chunk)
            if m:
                media_query = m.group(0).strip()
                # we don't push yet, we push when we see the opening brace '{'
                i += len(m.group(0))
                # skip whitespace
                while i < len(chars) and chars[i].isspace():
                    i += 1
                if i < len(chars) and chars[i] == '{':
                    brace_depth += 1
                    current_media_stack.append(media_query)
                    brace_stack.append(('media', len(current_media_stack) - 1))
                    i += 1
                    continue
        elif chars[i] == '{':
            brace_depth += 1
            brace_stack.append(('other', brace_depth))
        elif chars[i] == '}':
            if brace_stack:
                val = brace_stack.pop()
                if val[0] == 'media':
                    current_media_stack.pop()
            brace_depth -= 1
        
        # record active media for current character
        char_media[i] = list(current_media_stack)
        i += 1
        
    # Now map character indices back to line numbers
    line_start_idx = 0
    for line_num, line in enumerate(lines, 1):
        line_len = len(line) + 1 # +1 for newline
        # Get active media for the line (use the start of the line, or middle)
        sample_idx = min(line_start_idx + len(line)//2, len(char_media)-1)
        media = char_media[sample_idx] if sample_idx >= 0 else []
        line_media.append((line_num, line, media))
        line_start_idx += line_len
        
    return line_media

def analyze():
    hunks = get_diff_hunks()
    if not hunks:
        print("No differences found in styles.css.")
        return
        
    line_media = parse_css_media_queries("/Users/ankanghosh/Desktop/projects/timer timer/styles.css")
    
    violations = []
    overrides_768 = []
    
    for start, count in hunks:
        # Check each line in this hunk range
        for line_num in range(start, start + count):
            if line_num <= len(line_media):
                ln, content, media = line_media[line_num - 1]
                # Is it inside @media (max-width: 768px)?
                # Note: some changes might be whitespace or comment additions, but let's check
                is_768 = any("768px" in m for m in media)
                if is_768:
                    overrides_768.append((line_num, content, media))
                else:
                    # Ignore empty lines or additions of comments if any, but otherwise flag it
                    if content.strip() and not content.strip().startswith("/*") and not content.strip().startswith("*"):
                        violations.append((line_num, content, media))
            else:
                violations.append((line_num, "<EOF or Out of range>", []))
                
    print(f"Total modified hunks: {len(hunks)}")
    print(f"Edits inside 768px media query: {len(overrides_768)} lines")
    print(f"Edits OUTSIDE 768px media query: {len(violations)} lines")
    if violations:
        print("\nVIOLATIONS FOUND:")
        for ln, content, media in violations:
            print(f"  Line {ln}: {content}  [Media: {media}]")
    else:
        print("\nSUCCESS: All changes are inside @media (max-width: 768px) blocks!")

if __name__ == "__main__":
    analyze()
