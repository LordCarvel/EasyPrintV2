param(
  [ValidateSet('patch', 'minor', 'major')]
  [string]$Bump = 'patch',
  [string]$Version = '',
  [string]$Message = '',
  [switch]$SkipChecks,
  [switch]$NoPush,
  [switch]$WaitRelease
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Run-Step {
  param(
    [string]$Label,
    [string]$FilePath,
    [string[]]$Arguments = @()
  )

  Write-Host ""
  Write-Host "==> $Label" -ForegroundColor Cyan
  & $FilePath @Arguments

  if ($LASTEXITCODE -ne 0) {
    throw "Falhou: $Label"
  }
}

function Get-RepoSlug {
  $remote = (& git remote get-url origin).Trim()
  if ($remote -match 'github\.com[:/](?<owner>[^/]+)/(?<repo>[^/.]+)(\.git)?$') {
    return "$($Matches.owner)/$($Matches.repo)"
  }

  return ''
}

function Get-NextVersion {
  param(
    [string]$CurrentVersion,
    [string]$BumpKind
  )

  $parts = $CurrentVersion.Split('.')
  if ($parts.Count -ne 3) {
    throw "Versao atual invalida em package.json: $CurrentVersion"
  }

  $major = [int]$parts[0]
  $minor = [int]$parts[1]
  $patch = [int]$parts[2]

  if ($BumpKind -eq 'major') {
    $major += 1
    $minor = 0
    $patch = 0
  } elseif ($BumpKind -eq 'minor') {
    $minor += 1
    $patch = 0
  } else {
    $patch += 1
  }

  return "$major.$minor.$patch"
}

function Wait-ForRelease {
  param(
    [string]$RepoSlug,
    [string]$TagName
  )

  if (-not $RepoSlug) {
    Write-Host "Nao consegui identificar o repositorio no GitHub para aguardar a release." -ForegroundColor Yellow
    return
  }

  $releaseApiUrl = "https://api.github.com/repos/$RepoSlug/releases/tags/$TagName"
  Write-Host ""
  Write-Host "==> Aguardando GitHub Release $TagName" -ForegroundColor Cyan

  for ($attempt = 1; $attempt -le 80; $attempt += 1) {
    try {
      $release = Invoke-RestMethod -Uri $releaseApiUrl -Headers @{ 'User-Agent' = 'EasyHubReleaseScript' }
      $assetNames = @($release.assets | ForEach-Object { $_.name })
      $hasInstaller = $assetNames | Where-Object { $_ -like 'EasyHub-Setup-*.exe' }
      $hasBlockmap = $assetNames | Where-Object { $_ -like 'EasyHub-Setup-*.exe.blockmap' }
      $hasLatest = $assetNames -contains 'latest.yml'

      if ($hasInstaller -and $hasBlockmap -and $hasLatest) {
        Write-Host "Release publicada: $($release.html_url)" -ForegroundColor Green
        return
      }

      Write-Host "Release encontrada, aguardando assets..." -ForegroundColor Yellow
    } catch {
      Write-Host "Aguardando workflow publicar a release... tentativa $attempt/80"
    }

    Start-Sleep -Seconds 15
  }

  throw "A release $TagName nao apareceu completa dentro do tempo esperado. Verifique o GitHub Actions."
}

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
Set-Location $repoRoot

if (-not (Test-Path 'package.json')) {
  throw "package.json nao encontrado."
}

if (-not (Test-Path '.github/workflows/release-desktop.yml')) {
  throw "Workflow .github/workflows/release-desktop.yml nao encontrado."
}

$branch = (& git rev-parse --abbrev-ref HEAD).Trim()
if ($branch -eq 'HEAD') {
  throw "Voce esta em detached HEAD. Troque para a branch main antes de publicar."
}

Run-Step 'Buscar tags e estado remoto' git @('fetch', 'origin', '--tags')

try {
  Run-Step "Atualizar branch $branch com --ff-only" git @('pull', '--ff-only', 'origin', $branch)
} catch {
  throw "Nao consegui atualizar a branch com --ff-only. Resolva divergencias antes de publicar."
}

$package = Get-Content 'package.json' -Raw | ConvertFrom-Json
$currentVersion = [string]$package.version
$nextVersion = if ($Version.Trim()) { $Version.Trim().TrimStart('v') } else { Get-NextVersion $currentVersion $Bump }
$tagName = "v$nextVersion"

$existingTag = ([string]::Join("`n", @(& git tag --list $tagName))).Trim()
if ($existingTag) {
  throw "A tag $tagName ja existe localmente. Use uma versao maior."
}

$remoteTag = ([string]::Join("`n", @(& git ls-remote --tags origin $tagName))).Trim()
if ($remoteTag) {
  throw "A tag $tagName ja existe no GitHub. Use uma versao maior."
}

Write-Host ""
Write-Host "Publicando proxima versao: $currentVersion -> $nextVersion" -ForegroundColor Green

Run-Step "Atualizar package.json para $nextVersion" npm @('version', $nextVersion, '--no-git-tag-version')

if (-not $SkipChecks) {
  Run-Step 'Validar build do frontend' npm @('run', 'build')
  Run-Step 'Validar testes de roteamento' npm @('run', 'test:routing')
  Run-Step 'Validar Electron main' node @('--check', 'electron/main.cjs')
  Run-Step 'Validar Electron preload' node @('--check', 'electron/preload.cjs')
}

Run-Step 'Adicionar arquivos no Git' git @('add', '-A')

$staged = ([string]::Join("`n", @(& git diff --cached --name-only))).Trim()
if (-not $staged) {
  throw "Nao ha arquivos para commitar."
}

$commitMessage = if ($Message.Trim()) { $Message.Trim() } else { "release: $tagName" }
Run-Step "Commit $commitMessage" git @('commit', '-m', $commitMessage)
Run-Step "Criar tag $tagName" git @('tag', $tagName)

if ($NoPush) {
  Write-Host ""
  Write-Host "Release preparada localmente, sem push por causa de -NoPush." -ForegroundColor Yellow
  Write-Host "Para publicar depois:"
  Write-Host "git push origin $branch"
  Write-Host "git push origin $tagName"
  exit 0
}

Run-Step "Push da branch $branch" git @('push', 'origin', $branch)
Run-Step "Push da tag $tagName" git @('push', 'origin', $tagName)

$repoSlug = Get-RepoSlug
if ($repoSlug) {
  Write-Host ""
  Write-Host "GitHub Actions: https://github.com/$repoSlug/actions/workflows/release-desktop.yml"
  Write-Host "Release: https://github.com/$repoSlug/releases/tag/$tagName"
}

if ($WaitRelease) {
  Wait-ForRelease $repoSlug $tagName
} else {
  Write-Host ""
  Write-Host "Aguarde o GitHub Actions terminar. Quando a release aparecer, o app instalado consegue atualizar." -ForegroundColor Green
}
