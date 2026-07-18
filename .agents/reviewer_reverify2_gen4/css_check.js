const fs = require('fs');
const path = require('path');

function checkFileSyntax(filePath) {
  console.log(`Checking ${filePath}...`);
  const content = fs.readFileSync(filePath, 'utf8');
  
  const stack = [];
  let inString = null;
  let isEscaped = false;
  let inComment = false;
  let line = 1;
  let col = 1;
  
  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    
    if (char === '\n') {
      line++;
      col = 1;
    } else {
      col++;
    }
    
    // Handle comments
    if (inComment) {
      if (char === '/' && content[i - 1] === '*') {
        inComment = false;
      }
      continue;
    }
    
    if (!inString && char === '/' && content[i + 1] === '*') {
      inComment = true;
      i++;
      col++;
      continue;
    }
    
    // Handle strings
    if (inString) {
      if (isEscaped) {
        isEscaped = false;
      } else if (char === '\\') {
        isEscaped = true;
      } else if (char === inString) {
        inString = null;
      }
      continue;
    }
    
    if (char === '"' || char === "'" || char === '`') {
      inString = char;
      continue;
    }
    
    // Handle braces/parentheses
    if (char === '{' || char === '(' || char === '[') {
      stack.push({ char, line, col });
    } else if (char === '}' || char === ')' || char === ']') {
      if (stack.length === 0) {
        console.error(`Error: Unmatched closing character '${char}' at line ${line}, col ${col}`);
        return false;
      }
      const top = stack.pop();
      const expected = { '}': '{', ')': '(', ']': '[' }[char];
      if (top.char !== expected) {
        console.error(`Error: Mismatched character. Expected closing for '${top.char}' (from line ${top.line}, col ${top.col}) but found '${char}' at line ${line}, col ${col}`);
        return false;
      }
    }
  }
  
  if (inComment) {
    console.error(`Error: Unclosed comment at the end of the file`);
    return false;
  }
  
  if (inString) {
    console.error(`Error: Unclosed string literal at the end of the file`);
    return false;
  }
  
  if (stack.length > 0) {
    const top = stack[stack.length - 1];
    console.error(`Error: Unclosed opening character '${top.char}' at line ${top.line}, col ${top.col}`);
    return false;
  }
  
  console.log(`Success: ${filePath} is syntactically balanced and clean!`);
  return true;
}

const stylesPath = path.resolve(__dirname, '../../styles.css');
const appPath = path.resolve(__dirname, '../../app.js');

const stylesOk = checkFileSyntax(stylesPath);
const appOk = checkFileSyntax(appPath);

if (!stylesOk || !appOk) {
  process.exit(1);
} else {
  console.log("All syntax checks passed successfully!");
}
