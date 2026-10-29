# The plugin class is instantiated from Rust via JNI and its @Command methods are invoked by
# reflection; receivers/service are referenced from the manifest.
-keep class com.tend.native.** { *; }
