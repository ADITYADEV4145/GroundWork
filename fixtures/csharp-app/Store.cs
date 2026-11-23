using System;
using System.Collections.Generic;
using Text = System.String;
using static System.Math;

namespace Demo;

/// <summary>Stores named records.</summary>
public class Store {
    public const string EnvKey = "APP_STORE_KEY";
    public static readonly string Endpoint = "https://example.com/store";
    private readonly List<string> names = new List<string>();

    public Store() {}

    [Obsolete]
    public int Add(string prefix = "", params string[] values) {
        foreach (var value in values) names.Add(prefix + value);
        return names.Count;
    }

    public static string Normalize(string name) {
        if (name.Trim().Length == 0) { return "unknown"; }
        return name.Trim().ToLowerInvariant();
    }

    private static string CleanName(string value) {
        return value.Trim().ToLowerInvariant();
    }

    public record Entry(string Name);
    public struct Key { public int Value; }
    public enum State { Ready, Closed }
}

public interface IReader { string Read(); }
