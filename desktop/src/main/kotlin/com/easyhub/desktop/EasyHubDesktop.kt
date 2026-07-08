package com.easyhub.desktop

import com.sun.net.httpserver.HttpExchange
import com.sun.net.httpserver.HttpServer
import javafx.application.Application
import javafx.application.Platform
import javafx.beans.value.ChangeListener
import javafx.concurrent.Worker
import javafx.event.EventHandler
import javafx.geometry.Insets
import javafx.scene.Scene
import javafx.scene.control.Button
import javafx.scene.control.Label
import javafx.scene.input.Clipboard
import javafx.scene.layout.BorderPane
import javafx.scene.layout.HBox
import javafx.scene.layout.Priority
import javafx.scene.web.PromptData
import javafx.scene.web.WebEvent
import javafx.scene.web.WebView
import javafx.stage.Stage
import javafx.util.Callback
import netscape.javascript.JSObject
import java.io.InputStream
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.URLDecoder
import java.nio.charset.StandardCharsets
import java.nio.file.Paths
import java.util.concurrent.Executors

class EasyHubDesktopApp : Application() {
  private val staticServer = StaticWebServer()

  override fun start(stage: Stage) {
    val appUrl = staticServer.start()
    val webView = WebView()
    val statusLabel = Label("Carregando")
    val engine = webView.engine
    val desktopBridge = DesktopBridge()

    engine.onAlert = EventHandler<WebEvent<String>> { event ->
      statusLabel.text = event.data ?: ""
    }

    engine.confirmHandler = Callback<String, Boolean> {
      true
    }

    engine.promptHandler = Callback<PromptData, String> { prompt ->
      prompt.defaultValue ?: ""
    }

    engine.loadWorker.stateProperty().addListener(ChangeListener { _, _, state ->
      statusLabel.text = when (state) {
        Worker.State.SUCCEEDED -> {
          val window = engine.executeScript("window") as JSObject
          window.setMember("easyHubDesktop", desktopBridge)
          "Pronto"
        }
        Worker.State.FAILED -> "Falha ao carregar"
        Worker.State.RUNNING -> "Carregando"
        else -> statusLabel.text
      }
    })

    val reloadButton = Button("Recarregar").apply {
      setOnAction { engine.reload() }
    }

    val toolbar = HBox(
      10.0,
      Label("Easy Hub Desktop"),
      statusLabel,
      reloadButton
    ).apply {
      padding = Insets(8.0, 10.0, 8.0, 10.0)
      HBox.setHgrow(statusLabel, Priority.ALWAYS)
    }

    val root = BorderPane().apply {
      top = toolbar
      center = webView
    }

    stage.title = "Easy Hub"
    stage.scene = Scene(root, 1280.0, 820.0)
    stage.minWidth = 980.0
    stage.minHeight = 680.0
    stage.isResizable = true
    stage.show()

    engine.load(appUrl)
  }

  override fun stop() {
    staticServer.stop()
    Platform.exit()
  }
}

class DesktopBridge {
  fun readClipboard(): String =
    Clipboard.getSystemClipboard().string ?: ""
}

private class StaticWebServer {
  private var server: HttpServer? = null

  fun start(): String {
    val address = InetSocketAddress(InetAddress.getByName("127.0.0.1"), 0)
    val nextServer = HttpServer.create(address, 0)
    nextServer.executor = Executors.newCachedThreadPool()
    nextServer.createContext("/") { exchange -> handle(exchange) }
    nextServer.start()
    server = nextServer
    return "http://127.0.0.1:${nextServer.address.port}/"
  }

  fun stop() {
    server?.stop(0)
    server = null
  }

  private fun handle(exchange: HttpExchange) {
    if (exchange.requestMethod != "GET" && exchange.requestMethod != "HEAD") {
      exchange.sendResponseHeaders(405, -1)
      exchange.close()
      return
    }

    val requestedPath = resolvePath(exchange.requestURI.path)
    val stream = readResource(requestedPath) ?: readResource("/index.html")

    if (stream == null) {
      exchange.sendResponseHeaders(404, -1)
      exchange.close()
      return
    }

    val bytes = stream.use(InputStream::readBytes)
    exchange.responseHeaders.add("Content-Type", contentType(requestedPath))
    exchange.responseHeaders.add("Cache-Control", "no-cache")
    exchange.sendResponseHeaders(200, if (exchange.requestMethod == "HEAD") -1 else bytes.size.toLong())

    if (exchange.requestMethod != "HEAD") {
      exchange.responseBody.use { output -> output.write(bytes) }
    } else {
      exchange.close()
    }
  }

  private fun resolvePath(rawPath: String): String {
    val decoded = URLDecoder.decode(rawPath.ifBlank { "/" }, StandardCharsets.UTF_8)
      .replace('\\', '/')
    val normalized = Paths.get(decoded).normalize().toString().replace('\\', '/')

    if (normalized.startsWith("..")) return "/index.html"

    val path = when {
      normalized == "." || normalized == "/" -> "/index.html"
      normalized.startsWith("/") -> normalized
      else -> "/$normalized"
    }

    return if (path.substringAfterLast('/').contains('.') && resourceExists(path)) {
      path
    } else if (resourceExists(path)) {
      path
    } else {
      "/index.html"
    }
  }

  private fun resourceExists(path: String): Boolean =
    javaClass.getResource("/web$path") != null

  private fun readResource(path: String): InputStream? =
    javaClass.getResourceAsStream("/web$path")

  private fun contentType(path: String): String = when (path.substringAfterLast('.', "")) {
    "html" -> "text/html; charset=utf-8"
    "js" -> "text/javascript; charset=utf-8"
    "css" -> "text/css; charset=utf-8"
    "json" -> "application/json; charset=utf-8"
    "png" -> "image/png"
    "jpg", "jpeg" -> "image/jpeg"
    "svg" -> "image/svg+xml"
    "ico" -> "image/x-icon"
    else -> "application/octet-stream"
  }
}

fun main(args: Array<String>) {
  Application.launch(EasyHubDesktopApp::class.java, *args)
}
