# R8 for the release APK. The app's own code stays exactly as written (kotlinx.serialization models,
# WorkManager workers, the Cast options provider named in the manifest …); what gets optimized is the
# libraries — Compose, Media3, Ktor, Coil — which is where the speed comes from. Names are kept as they
# are, so crash reports stay readable.
-dontobfuscate
-keep class space.avthsr.music.** { *; }
-keepattributes *Annotation*,Signature,InnerClasses,EnclosingMethod,SourceFile,LineNumberTable,RuntimeVisibleAnnotations

# found through ServiceLoader
-keep class * implements coil3.util.FetcherServiceLoaderTarget { *; }
-keep class * implements coil3.util.DecoderServiceLoaderTarget { *; }
-keep class io.ktor.client.engine.okhttp.** { *; }

# optional parts of libraries that are not in the APK
-dontwarn org.slf4j.**
-dontwarn java.lang.management.**
-dontwarn org.conscrypt.**
-dontwarn org.bouncycastle.**
-dontwarn org.openjsse.**
-dontwarn io.ktor.**
-dontwarn coil3.**
-dontwarn kotlinx.serialization.**
-dontwarn com.google.errorprone.annotations.**
-dontwarn javax.annotation.**
-ignorewarnings
