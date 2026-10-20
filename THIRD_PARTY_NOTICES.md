# Third-party notices

Runtime dependency review: 2026-10-20. Own implementation is MIT. No source from the reviewed third-party Apple MCP candidates was copied.

| Runtime dependency | Version | Upstream license | Included notice |
|---|---|---|---|
| @modelcontextprotocol/client | 2.3.1 | Apache-2.0 | [licenses/MCP-CLIENT-LICENSE.txt](licenses/MCP-CLIENT-LICENSE.txt) |
| @modelcontextprotocol/core | 2.3.1 | Apache-2.0 | [licenses/MCP-CORE-LICENSE.txt](licenses/MCP-CORE-LICENSE.txt) |
| @modelcontextprotocol/server | 2.3.1 | Apache-2.0 | [licenses/MCP-SERVER-LICENSE.txt](licenses/MCP-SERVER-LICENSE.txt) |
| cross-spawn | 7.0.6 | MIT | [licenses/CROSS-SPAWN-LICENSE.txt](licenses/CROSS-SPAWN-LICENSE.txt) |
| eventsource | 3.0.7 | MIT | [licenses/EVENTSOURCE-LICENSE.txt](licenses/EVENTSOURCE-LICENSE.txt) |
| eventsource-parser | 3.1.1 | MIT | [licenses/EVENTSOURCE-PARSER-LICENSE.txt](licenses/EVENTSOURCE-PARSER-LICENSE.txt) |
| isexe | 2.0.0 | ISC | [licenses/ISEXE-LICENSE.txt](licenses/ISEXE-LICENSE.txt) |
| jose | 6.2.12 | MIT | [licenses/JOSE-LICENSE.txt](licenses/JOSE-LICENSE.txt) |
| path-key | 3.1.1 | MIT | [licenses/PATH-KEY-LICENSE.txt](licenses/PATH-KEY-LICENSE.txt) |
| pkce-challenge | 5.0.1 | MIT | [licenses/PKCE-CHALLENGE-LICENSE.txt](licenses/PKCE-CHALLENGE-LICENSE.txt) |
| shebang-command | 2.0.0 | MIT | [licenses/SHEBANG-COMMAND-LICENSE.txt](licenses/SHEBANG-COMMAND-LICENSE.txt) |
| shebang-regex | 3.0.0 | MIT | [licenses/SHEBANG-REGEX-LICENSE.txt](licenses/SHEBANG-REGEX-LICENSE.txt) |
| which | 2.0.2 | ISC | [licenses/WHICH-LICENSE.txt](licenses/WHICH-LICENSE.txt) |
| zod | 4.6.7 | MIT | [licenses/ZOD-LICENSE.txt](licenses/ZOD-LICENSE.txt) |

The MCP SDK license files include upstream legacy contribution notices. The official MCP Client SDK is used by the installed connection-check utility. GitHub release packages bundle these 14 runtime dependencies to support offline installation after download. Their license texts above were copied from the pinned installed packages. Development build/test tools are not shipped. Versions are pinned in package-lock.json.

Upstream MCP SDK: https://github.com/modelcontextprotocol/typescript-sdk. Apple apps, scripting dictionaries, brands and generated projects are not included in the package.
