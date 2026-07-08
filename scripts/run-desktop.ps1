$ErrorActionPreference = 'Stop'

Set-Location (Resolve-Path (Join-Path $PSScriptRoot '..'))

$java = Get-Command java -ErrorAction SilentlyContinue
if (-not $java) {
  Write-Host 'Java/JDK nao foi encontrado no PATH. Instale JDK 21 para rodar o app Kotlin desktop.'
  exit 1
}

$gradlew = Join-Path (Get-Location) 'gradlew.bat'
if (Test-Path $gradlew) {
  & $gradlew ':desktop:run'
  exit $LASTEXITCODE
}

$gradle = Get-Command gradle -ErrorAction SilentlyContinue
if (-not $gradle) {
  Write-Host 'Gradle nao foi encontrado no PATH e este repo ainda nao tem Gradle Wrapper gerado.'
  Write-Host 'Instale o Gradle ou gere o wrapper com: gradle wrapper'
  exit 1
}

& $gradle.Source ':desktop:run'
exit $LASTEXITCODE
