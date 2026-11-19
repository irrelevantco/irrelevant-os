param([switch]$PlanOnly)
$ErrorActionPreference = 'Stop'
function Invoke-DockerText {
    param([string[]]$DockerArgs)
    $result = & docker @DockerArgs
    if ($LASTEXITCODE -ne 0) { throw 'Docker could not complete the operation shown above. Existing database storage was not reset.' }
    return ($result -join "`n")
}
function Get-DatabaseMount {
    $mounts = Invoke-DockerText @('inspect', '--format', '{{json .Mounts}}', 'irrelevant-phase1-db-1') | ConvertFrom-Json
    $mount = @($mounts | Where-Object { $_.Destination -eq '/var/lib/postgresql/data' })
    if ($mount.Count -ne 1 -or $mount[0].Type -ne 'volume' -or $mount[0].Name -ne 'irrelevant-phase1_phase1-db') {
        throw 'The expected existing database volume was not found. Stop here and keep the existing Docker data.'
    }
    return $mount[0].Name
}
try {
    Write-Host 'iRRELEVANT OS - repair local Windows startup' -ForegroundColor Green
    Write-Host 'Checking the existing Docker project and database volume...'
    $labels = Invoke-DockerText @('inspect', '--format', '{{json .Config.Labels}}', 'irrelevant-phase1-db-1') | ConvertFrom-Json
    if ($labels.'com.docker.compose.project' -ne 'irrelevant-phase1') { throw 'This is not the supported iRRELEVANT local project.' }
    $root = $labels.'com.docker.compose.project.working_dir'
    if (-not $root -or -not (Test-Path -LiteralPath $root -PathType Container)) { throw 'The original project folder is missing. Restore that folder before continuing; keep Docker volumes intact.' }
    $base = Join-Path $root 'compose.phase1.yml'
    $stackEnv = Join-Path $root 'work/stack.env'
    foreach ($file in @($base, $stackEnv)) {
        if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { throw "Required existing file is missing: $file. Do not regenerate credentials." }
    }
    $volumeName = Get-DatabaseMount
    $volumeBefore = @(Invoke-DockerText @('volume', 'inspect', $volumeName) | ConvertFrom-Json)[0]
    $override = Join-Path $root 'work/windows-startup-repair.yml'
    $overrideText = @'
services:
  db:
    ports: !reset []
    restart: unless-stopped
  auth:
    restart: unless-stopped
  rest:
    restart: unless-stopped
  gateway:
    restart: unless-stopped
volumes:
  phase1-db:
    external: true
    name: irrelevant-phase1_phase1-db
'@
    # This override is persistent. Compose records both file paths on recreated
    # containers so starting the group from Docker Desktop uses the same repair.
    [IO.File]::WriteAllText($override, $overrideText, (New-Object Text.UTF8Encoding($false)))
    $compose = @('compose', '--project-name', 'irrelevant-phase1', '--env-file', $stackEnv, '-f', $base, '-f', $override)
    # Keep the resolved configuration in memory: it contains existing credentials.
    $config = Invoke-DockerText ($compose + @('config', '--format', 'json')) | ConvertFrom-Json
    if (@($config.services.db.ports | Where-Object { $null -ne $_ }).Count -ne 0) { throw 'The repair did not remove the database host port. No containers were changed.' }
    $dataMount = @($config.services.db.volumes | Where-Object { $_.target -eq '/var/lib/postgresql/data' })
    if ($dataMount.Count -ne 1 -or $dataMount[0].source -ne 'phase1-db' -or $config.volumes.'phase1-db'.external -ne $true -or $config.volumes.'phase1-db'.name -ne $volumeName) {
        throw 'The repaired configuration does not reuse the original external volume. No containers were changed.'
    }
    $apiPorts = @($config.services.gateway.ports)
    if ($apiPorts.Count -ne 1 -or $apiPorts[0].host_ip -ne '127.0.0.1' -or [string]$apiPorts[0].published -ne '54321') { throw 'The existing API binding differs from the supported local stack. No containers were changed.' }
    Write-Host "Existing database volume: $volumeName"
    Write-Host 'PostgreSQL will stay on Docker networking; the local API stays at http://127.0.0.1:54321.'
    if ($PlanOnly) { Write-Host 'Plan checked. No containers were started or recreated.'; exit 0 }
    Write-Host 'Starting the existing services. Allow up to two minutes...'
    $null = Invoke-DockerText ($compose + @('up', '-d', '--wait', '--wait-timeout', '120', '--pull', 'never'))
    $volumeAfter = @(Invoke-DockerText @('volume', 'inspect', (Get-DatabaseMount)) | ConvertFrom-Json)[0]
    if ($volumeBefore.Name -ne $volumeAfter.Name -or $volumeBefore.CreatedAt -ne $volumeAfter.CreatedAt) { throw 'Database volume identity changed unexpectedly. Stop and inspect storage before using the app.' }
    $health = Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:54321/auth/v1/health' -TimeoutSec 15
    if ($health.StatusCode -ne 200) { throw 'Services started but the authentication health check is not ready.' }
    $counts = Invoke-DockerText @('exec', 'irrelevant-phase1-db-1', 'psql', '-X', '-At', '-U', 'postgres', '-d', 'postgres', '-c', "select json_build_object('organizations',(select count(*) from public.organizations),'businesses',(select count(*) from public.businesses),'leads',(select count(*) from public.leads));")
    Write-Host 'Database record counts:'
    Write-Host $counts
    Write-Host 'SUCCESS: Supabase is responding. Reopen iRRELEVANT OS with your existing connection.' -ForegroundColor Green
    Write-Host 'Enable Docker Desktop > Settings > General > Start Docker Desktop when you sign in.'
    Write-Host "Saved repair configuration: $override"
} catch {
    Write-Host ('Repair stopped: ' + $_.Exception.Message) -ForegroundColor Red
    Write-Host 'Send the displayed error back. Do not delete Docker volumes or regenerate your environment files.'
    exit 1
}
