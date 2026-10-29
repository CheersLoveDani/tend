package com.tend.native

import androidx.core.content.FileProvider

/** Its own class so it can sit beside the app's FileProvider in the merged manifest. */
class TendUpdateFileProvider : FileProvider()
