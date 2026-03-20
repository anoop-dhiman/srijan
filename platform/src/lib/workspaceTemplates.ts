import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

export type TemplateId = 'none' | 'node' | 'python' | 'go' | 'rust';

export const VALID_TEMPLATES: TemplateId[] = ['none', 'node', 'python', 'go', 'rust'];

const NODE_PACKAGE_JSON = `{
  "name": "my-app",
  "version": "1.0.0",
  "description": "",
  "main": "index.js",
  "scripts": {
    "start": "node index.js",
    "test": "echo \\"Error: no test specified\\" && exit 1"
  },
  "keywords": [],
  "author": "",
  "license": "ISC"
}
`;

const NODE_GITIGNORE = `node_modules/
npm-debug.log*
.env
dist/
`;

const PYTHON_REQUIREMENTS = ``;

const PYTHON_GITIGNORE = `__pycache__/
*.py[cod]
.env
venv/
.venv/
dist/
*.egg-info/
`;

const PYTHON_MAIN = `def main():
    print("Hello, World!")

if __name__ == "__main__":
    main()
`;

const GO_MOD = `module myapp

go 1.21
`;

const GO_MAIN = `package main

import "fmt"

func main() {
	fmt.Println("Hello, World!")
}
`;

const RUST_CARGO_TOML = `[package]
name = "myapp"
version = "0.1.0"
edition = "2021"

[dependencies]
`;

const RUST_MAIN_RS = `fn main() {
    println!("Hello, World!");
}
`;

export async function applyTemplate(workspacePath: string, template: TemplateId): Promise<void> {
  if (template === 'none') return;

  switch (template) {
    case 'node':
      writeFileSync(join(workspacePath, 'package.json'), NODE_PACKAGE_JSON, 'utf-8');
      writeFileSync(join(workspacePath, '.gitignore'), NODE_GITIGNORE, 'utf-8');
      break;

    case 'python':
      writeFileSync(join(workspacePath, 'requirements.txt'), PYTHON_REQUIREMENTS, 'utf-8');
      writeFileSync(join(workspacePath, '.gitignore'), PYTHON_GITIGNORE, 'utf-8');
      writeFileSync(join(workspacePath, 'main.py'), PYTHON_MAIN, 'utf-8');
      break;

    case 'go':
      writeFileSync(join(workspacePath, 'go.mod'), GO_MOD, 'utf-8');
      writeFileSync(join(workspacePath, 'main.go'), GO_MAIN, 'utf-8');
      break;

    case 'rust':
      mkdirSync(join(workspacePath, 'src'), { recursive: true });
      writeFileSync(join(workspacePath, 'Cargo.toml'), RUST_CARGO_TOML, 'utf-8');
      writeFileSync(join(workspacePath, 'src', 'main.rs'), RUST_MAIN_RS, 'utf-8');
      break;
  }
}
