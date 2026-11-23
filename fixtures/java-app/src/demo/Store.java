package demo;

import java.util.ArrayList;
import java.util.List;
import static java.util.Collections.emptyList;

/** Stores named records. */
public class Store {
    public static final String ENV_KEY = "APP_STORE_KEY";
    private final List<String> names = new ArrayList<>();

    public Store() {}

    /** Append one or more names. */
    public int add(String... values) {
        for (String value : values) names.add(value);
        return names.size();
    }

    public List<String> list() { return names; }

    public static String normalize(String name) {
        if (name.trim().isEmpty()) { return "unknown"; }
        return name.trim().toLowerCase();
    }

    private static String cleanName(String value) {
        return value.trim().toLowerCase();
    }

    public record Entry(String name) {}
    public enum State { READY, CLOSED }
}
