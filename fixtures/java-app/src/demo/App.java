package demo;

import demo.Store;
import static demo.Store.normalize;

public class App {
    public static String display(String name) {
        return Store.normalize(name);
    }
    public static String label(String name) {
        return normalize(name);
    }
}
