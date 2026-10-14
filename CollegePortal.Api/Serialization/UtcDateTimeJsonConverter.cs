using System.Globalization;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace CollegePortal.Api.Serialization;

/// <summary>
/// Serializes every DateTime as UTC with a trailing "Z". SQL Server's
/// datetime2 column type drops the DateTimeKind, so EF materializes values
/// that were written as UTC with Kind=Unspecified. Without this converter
/// System.Text.Json would emit them without a timezone marker and the client
/// would misinterpret them as local time.
/// </summary>
public sealed class UtcDateTimeJsonConverter : JsonConverterFactory
{
    public override bool CanConvert(Type typeToConvert) =>
        typeToConvert == typeof(DateTime) || typeToConvert == typeof(DateTime?);

    public override JsonConverter CreateConverter(Type typeToConvert, JsonSerializerOptions options) =>
        typeToConvert == typeof(DateTime?)
            ? new NullableConverter()
            : new Converter();

    private static DateTime ToUtc(DateTime value) => value.Kind switch
    {
        DateTimeKind.Utc => value,
        DateTimeKind.Local => value.ToUniversalTime(),
        _ => DateTime.SpecifyKind(value, DateTimeKind.Utc),
    };

    private static string Format(DateTime value) =>
        ToUtc(value).ToString("yyyy-MM-dd'T'HH:mm:ss.fffffff'Z'", CultureInfo.InvariantCulture);

    private sealed class Converter : JsonConverter<DateTime>
    {
        public override DateTime Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options) =>
            ToUtc(reader.GetDateTime());

        public override void Write(Utf8JsonWriter writer, DateTime value, JsonSerializerOptions options) =>
            writer.WriteStringValue(Format(value));
    }

    private sealed class NullableConverter : JsonConverter<DateTime?>
    {
        public override DateTime? Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options) =>
            reader.TokenType == JsonTokenType.Null ? null : ToUtc(reader.GetDateTime());

        public override void Write(Utf8JsonWriter writer, DateTime? value, JsonSerializerOptions options)
        {
            if (value is null)
                writer.WriteNullValue();
            else
                writer.WriteStringValue(Format(value.Value));
        }
    }
}
