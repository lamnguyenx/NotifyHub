#!/usr/bin/env python3
# Shared mock data for NotifyHub tests

MOCK_NOTIFICATIONS = (
    {
        "__comment__" : "this data make \"mantine-focus-auto notification-text2 message m_b6d8b162 mantine-Text-root\" break out of the container card",
        "message": "\n".join(
            [
                '[#tag:@USER][#truncated:+395 LINES]00394| \n\n(End of file - total 394 lines)\n&lt;/file&gt;\nCalled the Read tool with the following input: {"filePath":"/home/lamnt45/git/NotifyHub/src/notifyhub/plugins/opencode/opencode-trace.py"}\n[#tag:@ASSISTANT][#truncated:+8 LINES][#truncated:+129 CHARS]session/message/part data\n6. **YAML Output**: Supports YAML-formatted listing of messages\n\nThe script is well-structured with clear separation of concerns between listing and retrieving functionality.',
            ]
        ),
        "pwd": "/home/lamnt45/git/NotifyHub",
    },
    {
        "message": "\n".join(
            [
                "[#tag:@USER][#truncated:+47 LINES][#truncated:+1.2k CHARS] Hey, my build just failed with 'Module not found: Error: Can't resolve @auth/core'. Any ideas?",
                "[#tag:@ASSISTANT] That's a missing dependency. Did you recently pull changes or switch branches? Try running 'npm install' to sync your dependencies with package.json.",
            ]
        ),
        "pwd": "/Users/test/NotifyHub",
    },
    {
        "message": "\n".join(
            [
                "[#tag:@USER] ESLint is yelling at me about my React component. It says:\n\n'Missing return type on function'\n'Promise returned in function argument where void expected'\n\nAny quick fix for this?",
                "[#tag:@ASSISTANT] You need to add a return type to your async function and make sure your event handlers are typed correctly. Try adding ': Promise<void>' to your async handler, and ensure your props have proper TypeScript interfaces defined.",
            ]
        ),
        "pwd": "/tmp/Test Project",
    },
    {
        "message": "\n".join(
            [
                "[#tag:@ASSISTANT][#truncated:+156 LINES] Migration completed successfully:[#truncated:↵ × 2]- Users table: 45,203 rows updated[#truncated:↵ × 1]- Posts table: 128,456 rows updated[#truncated:↵ × 1]- Comments table: 892,103 rows updated[#truncated:↵ × 2]0 conflicts detected. Make sure to check the staging environment before deploying to production.",
                "[#tag:@USER][#truncated:+89 LINES][#truncated:+3.8k CHARS] Nice! Just tested the app and everything's working:\n\n✓ User authentication\n✓ Post creation/editing\n✓ Comment threads\n✓ Search functionality\n\nNo data loss on my end. Staging looks good too - pushing to production now.",
            ]
        ),
        "pwd": "/home/user/my-app",
    },
    {
        "message": "\n".join(
            [
                "[#tag:@USER] PR is ready for final review. I addressed all the comments from Sarah, fixed the test coverage, and added those edge case tests you mentioned.[#truncated:↵ × 2]Changes:[#truncated:↵ × 1]- Added unit tests for error handling[#truncated:↵ × 1]- Fixed the race condition in useEffect[#truncated:↵ × 1]- Updated documentation",
                "[#tag:@ASSISTANT][#truncated:+12 LINES][#truncated:+487 CHARS] Looks good! I see you added the edge case tests and improved coverage to 85%. Two approvals now - you're clear to merge. The CI will handle the deployment automatically once merged.",
            ]
        ),
        "pwd": "/projects/Foo Bar Baz",
    },
    {
        "message": "\n".join(
            [
                "[#tag:@USER] Just finished patching those CVEs from the security scan:\n\nUpdated packages:\n- axios: 0.21.1 → 1.6.2 (CVE-2023-45857)\n- json5: 2.1.0 → 2.2.3 (CVE-2022-46175)\n- semver: 6.3.0 → 7.5.4 (CVE-2022-25883)\n\nRan 'npm audit' and Snyk - both came back clean with 0 high severity issues.",
                "[#tag:@ASSISTANT] Excellent work. Make sure to document this in the security log for compliance, and update the CHANGELOG with the patched versions. Also consider scheduling a penetration test for next quarter.",
            ]
        ),
        "pwd": "/workspace/A",
    },
    {
        "message": "\n".join(
            [
                "[#tag:@ASSISTANT] Just deployed the performance optimizations to staging:[#truncated:↵ × 2]Metrics:[#truncated:↵ × 1]- Initial load time: 5.2s → 2.1s (60% reduction)[#truncated:↵ × 1]- Time to interactive: 6.8s → 3.2s (53% reduction)[#truncated:↵ × 1]- Memory usage: 145MB → 98MB (32% reduction)[#truncated:↵ × 2]Implemented code splitting, lazy loading for heavy components, and fixed useEffect cleanup issues.",
                "[#tag:@USER] Wow, the dashboard loaded in like 2 seconds now! It used to take 5+. The whole app feels so much snappier. When can we push this to production?",
            ]
        ),
        "pwd": "/app/Long Project Name Here",
    },
    {
        "message": "\n".join(
            [
                "[#tag:@USER] Documentation update is live! Added translations for Spanish, French, German, and Japanese using react-i18next.\n\nCoverage:\n- 100% of UI strings\n- 100% of error messages\n- 85% of help articles\n\nIt integrates really well with our existing setup.",
                "[#tag:@ASSISTANT] That's great for our international users. Make sure to add a language selector to the UI so users can easily switch between languages. Also, consider adding RTL support for Arabic and Hebrew in the next iteration.",
            ]
        ),
        "pwd": "/dev/Secure App With Many Words",
    },
    {
        "message": "\n".join(
            [
                "[#tag:@ASSISTANT] Deployment to production went smoothly![#truncated:↵ × 2]Deployment summary:[#truncated:↵ × 1]- Started: 14:32:18 UTC[#truncated:↵ × 1]- Completed: 14:35:42 UTC[#truncated:↵ × 1]- Duration: 3m 24s[#truncated:↵ × 1]- Migration time: 47s[#truncated:↵ × 1]- Zero downtime achieved[#truncated:↵ × 2]Blue-green deployment worked perfectly, and all health checks are passing.",
                "[#tag:@USER] Thanks for monitoring it! I was worried about that database migration affecting active users. Glad everything went well. When's the next release scheduled?",
            ]
        ),
        "pwd": "/src/Project-123",
    },
    {
        "message": "\n".join(
            [
                "[#tag:@USER] CI/CD pipeline is finally stable! Fixed the Docker build cache issue:\n\nBefore:\n- Build time: 12m 34s\n- Cache hit rate: 23%\n\nAfter:\n- Build time: 2m 58s (76% reduction)\n- Cache hit rate: 89%\n\nAutomated deployments to staging are working like a charm now.",
                "[#tag:@ASSISTANT] That's a huge win for developer productivity. Nice optimization! Before enabling auto-deploy to production, make sure to add smoke tests and set up proper rollback mechanisms. Also consider adding Slack notifications for deployment status.",
            ]
        ),
        "pwd": "/docs/@special#dir!",
    },
    {
        "message": "\n".join(
            [
                "[#tag:@ASSISTANT] I see you're working on the authentication feature. If you need help with JWT token refresh logic, I can show you how to set up an Axios interceptor to catch 401 responses and automatically refresh tokens.",
                "[#tag:@USER][#truncated:+23 LINES] Yes please! That would be super helpful. I have the refresh token stored in httpOnly cookies, but I'm not sure when to refresh the access token.[#truncated:↵ × 2]Current setup:[#truncated:↵ × 1]- Access token: JWT, 15min expiry[#truncated:↵ × 1]- Refresh token: httpOnly cookie, 7d expiry[#truncated:↵ × 1]- Storage: localStorage for access token[#truncated:↵ × 2]The JWT expires after 15 minutes and users are getting logged out.",
            ]
        ),
        "pwd": "/ci/my-app",
    },
)


def main():
    for i, notification in enumerate(MOCK_NOTIFICATIONS, 1):
        print(f"Notification {i}:")
        print(f"  PWD: {notification['pwd']}")
        print(f"  Message:\n{notification['message']}")
        print("-" * 50)


if __name__ == "__main__":
    main()
