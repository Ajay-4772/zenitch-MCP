# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | :white_check_mark: |

## Security Model & Defense-in-Depth Mitigations

Zenitch MCP operates under defined defensive-computing boundaries:

1. **Read-Only Codebase Inspection**: File scanning tools (`zenitch_inspect_project`, `zenitch_analyze_architecture`) only perform read-only inspection operations. They do not overwrite or modify project source files.
2. **Confined Memory Storage**: All persistent state, decision logs, and verification evidence are strictly quarantined within the `.zenitch/` directory inside the targeted project root. Path traversal attempts outside the project root are rejected.
3. **Secret Redaction**: Built-in redaction filters mask common environment variables and credential patterns (`.env`, API keys, tokens) to prevent leakage in tool responses or error traces.
4. **Network & SSRF Hardening**: Network audit tools block RFC 1918 private subnets, loopback addresses (`127.0.0.1`, `::1`), and cloud instance metadata endpoints, while enforcing a 2 MB maximum response buffer cap.
5. **Stdio Protocol Isolation**: Process `stdout` is strictly reserved for valid JSON-RPC 2.0 messages. All logging, telemetry, and diagnostics are directed to `stderr`.

## Limitations

Zenitch MCP's security controls operate at the application level:
- It does not replace host-level operating system permissions or network-level firewall isolation.
- It scans and inspects code within the configured repository root; users must exercise caution when executing AI-generated commands or scripts outside Zenitch's inspection tools.

## Reporting a Vulnerability

If you discover a security vulnerability within Zenitch MCP, please report it responsibly:

- **Private Vulnerability Reporting**: If enabled on GitHub, use [Report a vulnerability](https://github.com/Ajay-4772/zenitch-MCP/security/advisories/new) under the repository's **Security** tab.
- **Direct Contact**: If Private Vulnerability Reporting is not active, please reach out to the repository maintainer directly through GitHub ([@Ajay-4772](https://github.com/Ajay-4772)).

Please do not open public issues for security vulnerabilities until a fix has been prepared and coordinated.

Please include:
- A clear description of the vulnerability and attack vector.
- Minimal reproducible steps or proof-of-concept.
- Affected versions, operating system, and Node.js environment.

Reports will be reviewed promptly and handled through coordinated disclosure.
