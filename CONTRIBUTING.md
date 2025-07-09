# Contributing to E2B Sandbox MCP

Thank you for your interest in contributing to E2B Sandbox MCP! This document provides guidelines and information for contributors.

## 🤝 How to Contribute

### Reporting Issues

- Use the [GitHub Issues](https://github.com/your-username/e2b-sandbox-mcp/issues) page
- Search existing issues before creating a new one
- Include detailed steps to reproduce the issue
- Provide system information (OS, Node.js version, etc.)

### Suggesting Features

- Open an issue with the "enhancement" label
- Describe the use case and expected behavior
- Consider backwards compatibility

### Code Contributions

1. **Fork the Repository**
   ```bash
   git clone https://github.com/your-username/e2b-sandbox-mcp.git
   cd e2b-sandbox-mcp
   ```

2. **Create a Feature Branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

3. **Set Up Development Environment**
   ```bash
   npm install
   npm run build
   ```

4. **Make Your Changes**
   - Follow existing code style and patterns
   - Add tests for new functionality
   - Update documentation as needed

5. **Test Your Changes**
   ```bash
   npm test
   npm run build
   ```

6. **Commit Your Changes**
   ```bash
   git add .
   git commit -m "feat: add your feature description"
   ```

7. **Push and Create Pull Request**
   ```bash
   git push origin feature/your-feature-name
   ```

## 📝 Development Guidelines

### Code Style

- Use TypeScript for all new code
- Follow existing formatting (run `npm run format` if available)
- Use meaningful variable and function names
- Add JSDoc comments for public APIs

### Commit Messages

Use conventional commit format:
- `feat:` for new features
- `fix:` for bug fixes
- `docs:` for documentation changes
- `refactor:` for code refactoring
- `test:` for adding tests

### Testing

- Add unit tests for new functions
- Test MCP tool functionality
- Test error handling and edge cases
- Verify compatibility with E2B API changes

### Documentation

- Update README.md if adding new features
- Add inline comments for complex logic
- Update JSDoc comments
- Include examples for new functionality

## 🏗️ Project Structure

```
src/
├── index.ts              # Main MCP server
├── sandbox-manager.ts    # E2B sandbox management
└── computer-use-tools.ts # Computer action implementations

examples/
├── simple-test.js        # Basic testing
├── client-integration.ts # Advanced examples
└── web-integration/      # Web app example
```

## 🔧 Development Scripts

- `npm run dev` - Development server with hot reload
- `npm run build` - Compile TypeScript
- `npm test` - Run tests
- `npm run inspect` - Debug mode

## 📋 Pull Request Checklist

- [ ] Code follows project style guidelines
- [ ] Tests pass (`npm test`)
- [ ] Build succeeds (`npm run build`)
- [ ] Documentation updated if needed
- [ ] Commit messages follow conventional format
- [ ] PR description explains changes clearly

## 🚦 Review Process

1. Automated checks must pass
2. Code review by maintainers
3. Manual testing of new features
4. Documentation review
5. Merge after approval

## 📄 License

By contributing, you agree that your contributions will be licensed under the MIT License.

## 🙋‍♀️ Questions?

- Open an issue for general questions
- Check existing documentation first
- Join our community discussions

Thank you for contributing! 🎉 