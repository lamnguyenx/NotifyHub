#!/usr/bin/env python3

"""
Gitignore to Dockerignore Converter

This script converts a .gitignore file to a .dockerignore file,
adding Docker-specific exclusion patterns and avoiding duplicates.
Supports reading from stdin and writing to stdout.
"""

import argparse
import os
import sys
from datetime import datetime


def parse_arguments():
    """Parse command line arguments."""
    parser = argparse.ArgumentParser(
        description="Convert .gitignore to .dockerignore with Docker-specific additions."
    )
    parser.add_argument(
        "-i", "--input",
        help="Path to the input .gitignore file (default: stdin if no file provided)"
    )
    parser.add_argument(
        "-o", "--output",
        help="Path to the output .dockerignore file (default: stdout if not provided)"
    )
    parser.add_argument(
        "-f", "--force",
        action="store_true",
        help="Force overwrite if output file already exists"
    )
    parser.add_argument(
        "--no-backup",
        action="store_true",
        help="Don't create backup if output file already exists"
    )
    parser.add_argument(
        "file_arg", nargs="?",
        help="Input file as positional argument"
    )
    return parser.parse_args()


def read_input_content(input_file, file_arg):
    """Read the input content from file or stdin."""
    try:
        if input_file:
            with open(input_file, 'r', encoding='utf-8') as f:
                return f.read()
        elif file_arg:
            with open(file_arg, 'r', encoding='utf-8') as f:
                return f.read()
        else:
            return sys.stdin.read()
    except FileNotFoundError as e:
        print(f"Error: {e.filename} not found.")
        sys.exit(1)
    except PermissionError as e:
        print(f"Error: Permission denied reading {e.filename}")
        sys.exit(1)
    except Exception as e:
        print(f"Error reading input: {str(e)}")
        sys.exit(1)


def process_gitignore_patterns(content):
    """Convert Git patterns to Docker-compatible recursive patterns."""
    processed_lines = []
    for line in content.splitlines():
        stripped = line.strip()
        original = line.rstrip()

        if not stripped or stripped.startswith('#'):
            processed_lines.append(original)
            continue

        negation = stripped.startswith('!')
        pattern = stripped[1:].lstrip() if negation else stripped
        had_leading_slash = pattern.startswith('/')

        # Remove leading slash and process directory patterns
        pattern = pattern.lstrip('/')
        if stripped.endswith('/'):
            if not had_leading_slash and not pattern.startswith('**/'):
                pattern = f'**/{pattern}'

        # Reconstruct line with proper negation
        processed = f'!{pattern}' if negation else pattern
        processed_lines.append(processed)

    return '\n'.join(processed_lines)


def get_docker_specific_patterns():
    """Return Docker-specific patterns to add."""
    return f"""
# Docker files
Dockerfile*
.dockerignore
docker-compose*.yml
docker-compose*.yaml
**/.docker/

# Version control
**/.git/
.gitignore
.gitattributes
**/.github/
**/.gitlab/
**/.hg/
**/.svn/

# CI/CD files
.travis.yml
.gitlab-ci.yml
**/.circleci/
**/.jenkins/
**/.github/workflows/
**/.azure-pipelines/
bitbucket-pipelines.yml

# Build artifacts
**/target/
**/node_modules/
**/dist/
**/build/
**/.cache/

# IDE and Editor files
**/.idea/
**/.vscode/
*.sublime-*
*.swp
*.swo
*~

# Environment files
.env
.env.*
*.local
"""


def check_for_duplicates(content, docker_patterns):
    """Remove duplicate Docker patterns already present in content."""
    existing = {line.strip() for line in content.splitlines()
               if line.strip() and not line.strip().startswith('#')}
    return [line for line in docker_patterns.splitlines()
           if line.strip() not in existing and line.strip()]


def create_dockerignore(gitignore_content, docker_patterns):
    """Create final .dockerignore content."""
    processed_gitignore = process_gitignore_patterns(gitignore_content)
    docker_section = '\n'.join(check_for_duplicates(processed_gitignore, docker_patterns))

    return f"""# .dockerignore generated from .gitignore
# Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}

{processed_gitignore}

# -------------------------------------------------------------------
#                           DOCKER SPECIALS
# -------------------------------------------------------------------
{docker_section}
"""


def write_output(content, output_file, force=False, no_backup=False):
    """Write content to output file or stdout."""
    if not output_file:
        print(content)
        return 0

    if os.path.exists(output_file):
        if not force:
            if not no_backup:
                try:
                    os.rename(output_file, f"{output_file}.bak")
                    print(f"Created backup: {output_file}.bak")
                except Exception as e:
                    print(f"Backup failed: {str(e)}")
                    return 1
            print(f"Overwriting existing {output_file}")

    try:
        with open(output_file, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"Successfully created {output_file}")
        return 0
    except Exception as e:
        print(f"Write failed: {str(e)}")
        return 1


def main():
    args = parse_arguments()
    gitignore_content = read_input_content(args.input, args.file_arg)
    docker_patterns = get_docker_specific_patterns()
    dockerignore_content = create_dockerignore(gitignore_content, docker_patterns)
    return write_output(dockerignore_content, args.output, args.force, args.no_backup)


if __name__ == "__main__":
    sys.exit(main())