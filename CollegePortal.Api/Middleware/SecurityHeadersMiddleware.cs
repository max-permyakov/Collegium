namespace CollegePortal.Api.Middleware;

// Adds defensive HTTP response headers. The strict Content-Security-Policy is
// only applied outside Development so that the Swagger UI keeps working locally.
public class SecurityHeadersMiddleware
{
    private const string ContentSecurityPolicy =
        "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";

    private readonly RequestDelegate _next;
    private readonly bool _isDevelopment;

    public SecurityHeadersMiddleware(RequestDelegate next, IWebHostEnvironment environment)
    {
        _next = next;
        _isDevelopment = environment.IsDevelopment();
    }

    public async Task InvokeAsync(HttpContext context)
    {
        var headers = context.Response.Headers;

        headers["X-Content-Type-Options"] = "nosniff";
        headers["X-Frame-Options"] = "DENY";
        headers["Referrer-Policy"] = "no-referrer";
        headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()";

        if (!_isDevelopment)
        {
            headers["Content-Security-Policy"] = ContentSecurityPolicy;
        }

        await _next(context);
    }
}
