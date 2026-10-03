// Covers and canvases: one image loader for the whole app, over the platform's HTTP stack.
package space.avthsr.music.ui

import coil3.ComponentRegistry
import coil3.ImageLoader
import coil3.PlatformContext
import coil3.network.ktor3.KtorNetworkFetcherFactory
import coil3.request.crossfade
import space.avthsr.music.httpClient

fun imageLoader(context: PlatformContext, extra: ComponentRegistry.Builder.() -> Unit = {}): ImageLoader =
  ImageLoader.Builder(context)
    .crossfade(180)
    .components {
      add(KtorNetworkFetcherFactory { httpClient {} })
      extra()
    }
    .build()
