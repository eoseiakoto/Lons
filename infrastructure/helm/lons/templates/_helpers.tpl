{{/*
Expand the name of the chart.
*/}}
{{- define "lons.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
We truncate at 63 chars because some Kubernetes name fields are limited to this (by the DNS naming spec).
*/}}
{{- define "lons.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "lons.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "lons.labels" -}}
helm.sh/chart: {{ include "lons.chart" . }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/part-of: lons
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}

{{/*
Component labels - call with (dict "context" $ "component" "graphql-server")
*/}}
{{- define "lons.componentLabels" -}}
{{ include "lons.labels" .context }}
app.kubernetes.io/name: {{ .component }}
app.kubernetes.io/instance: {{ .context.Release.Name }}
app.kubernetes.io/component: {{ .component }}
{{- end }}

{{/*
Selector labels for a component - call with (dict "context" $ "component" "graphql-server")
*/}}
{{- define "lons.selectorLabels" -}}
app.kubernetes.io/name: {{ .component }}
app.kubernetes.io/instance: {{ .context.Release.Name }}
{{- end }}

{{/*
Return the image for a service.
Usage: {{ include "lons.image" (dict "imageValues" .Values.graphqlServer.image "global" .Values.global) }}
*/}}
{{- define "lons.image" -}}
{{- $tag := .imageValues.tag -}}
{{- if .global.imageTag -}}
{{- $tag = .global.imageTag -}}
{{- end -}}
{{- printf "%s:%s" .imageValues.repository $tag -}}
{{- end }}

{{/*
Return the name of the configmap.
*/}}
{{- define "lons.configmapName" -}}
{{- printf "%s-config" (include "lons.fullname" .) -}}
{{- end }}

{{/*
Return the name of the secrets.
*/}}
{{- define "lons.secretName" -}}
{{- printf "%s-secrets" (include "lons.fullname" .) -}}
{{- end }}
