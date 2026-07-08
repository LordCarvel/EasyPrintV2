plugins {
  kotlin("jvm") version "2.0.21"
  application
  id("org.openjfx.javafxplugin") version "0.1.0"
}

java {
  toolchain {
    languageVersion.set(JavaLanguageVersion.of(21))
  }
}

application {
  mainClass.set("com.easyhub.desktop.EasyHubDesktopKt")
}

javafx {
  version = "21.0.5"
  modules = listOf("javafx.controls", "javafx.web")
}

val buildWeb by tasks.registering(Exec::class) {
  workingDir = rootProject.projectDir
  commandLine("node", rootProject.file("node_modules/vite/bin/vite.js").absolutePath, "build", "--base=/")
}

tasks.processResources {
  dependsOn(buildWeb)
  from(rootProject.layout.projectDirectory.dir("dist")) {
    into("web")
  }
}
