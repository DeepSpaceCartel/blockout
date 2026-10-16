{{/* Names and labels (app.kubernetes.io/*) shared by every object */}}
{{- define "blockout.name" -}}
{{- .Chart.Name | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "blockout.fullname" -}}
{{- if contains .Chart.Name .Release.Name -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name .Chart.Name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}

{{- define "blockout.selectorLabels" -}}
app.kubernetes.io/name: {{ include "blockout.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

{{- define "blockout.labels" -}}
{{ include "blockout.selectorLabels" . }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" }}
{{- end -}}

{{/* repository:tag, or repository@digest when a digest is given */}}
{{- define "blockout.image" -}}
{{- if .Values.image.digest -}}
{{ .Values.image.repository }}@{{ .Values.image.digest }}
{{- else -}}
{{ .Values.image.repository }}:{{ .Values.image.tag | default .Chart.AppVersion }}
{{- end -}}
{{- end -}}

{{/*
The chart's other parts (MongoDB, Valkey, Keycloak's Postgres): their own
app.kubernetes.io/name, so the server's selectors never pick them up.
Called with (list $ "mongo").
*/}}
{{- define "blockout.part.selectorLabels" -}}
app.kubernetes.io/name: {{ index . 1 }}
app.kubernetes.io/instance: {{ (index . 0).Release.Name }}
{{- end -}}

{{- define "blockout.part.labels" -}}
{{- $ := index . 0 -}}
{{ include "blockout.part.selectorLabels" . }}
app.kubernetes.io/part-of: blockout
app.kubernetes.io/managed-by: {{ $.Release.Service }}
helm.sh/chart: {{ printf "%s-%s" $.Chart.Name $.Chart.Version | replace "+" "_" }}
{{- end -}}

{{/*
A password made once: the one already in the Secret if there is one, else a new
random one. Called with (list $ "<secret>" "<key>" <length>). (helm template
can't look Secrets up, so it always shows new ones.)
*/}}
{{- define "blockout.password" -}}
{{- $ := index . 0 -}}
{{- $old := lookup "v1" "Secret" $.Release.Namespace (index . 1) -}}
{{- if and $old $old.data (hasKey $old.data (index . 2)) -}}
{{- index $old.data (index . 2) | b64dec -}}
{{- else -}}
{{- randAlphaNum (index . 3) -}}
{{- end -}}
{{- end -}}

{{/* Where the server finds MongoDB's and Valkey's URLs: the chart's Secrets, or the external ones */}}
{{- define "blockout.mongoSecret" -}}
{{- if .Values.mongo.enabled }}{{ .Release.Name }}-mongo{{ else }}{{ required "mongo.external.secretName: the Secret with MongoDB's URL (or mongo.enabled)" .Values.mongo.external.secretName }}{{ end -}}
{{- end -}}
{{- define "blockout.mongoKey" -}}
{{- if .Values.mongo.enabled }}url{{ else }}{{ .Values.mongo.external.key }}{{ end -}}
{{- end -}}
{{- define "blockout.redisSecret" -}}
{{- if .Values.valkey.enabled }}{{ .Release.Name }}-redis{{ else }}{{ required "valkey.external.secretName: the Secret with the Redis URL (or valkey.enabled)" .Values.valkey.external.secretName }}{{ end -}}
{{- end -}}
{{- define "blockout.redisKey" -}}
{{- if .Values.valkey.enabled }}url{{ else }}{{ .Values.valkey.external.key }}{{ end -}}
{{- end -}}

{{/* The tokens' issuer: the bundled Keycloak's realm, or keycloak.issuer */}}
{{- define "blockout.issuer" -}}
{{- if .Values.keycloak.issuer -}}
{{ .Values.keycloak.issuer }}
{{- else if .Values.keycloak.enabled -}}
{{ required "keycloak.url: Keycloak's public address (https://…)" .Values.keycloak.url | trimSuffix "/" }}/realms/blockout
{{- else -}}
{{ fail "keycloak.issuer is required when keycloak.enabled is false (https://…/realms/blockout)" }}
{{- end -}}
{{- end -}}

{{/* The server's pull Secrets: the one made from imageCredentials, and any named */}}
{{- define "blockout.imagePullSecrets" -}}
{{- $list := .Values.imagePullSecrets -}}
{{- if .Values.imageCredentials.password -}}
{{- $list = append $list (dict "name" (printf "%s-pull" (include "blockout.fullname" .))) -}}
{{- end -}}
{{- with $list }}
imagePullSecrets: {{- toYaml . | nindent 2 }}
{{- end }}
{{- end -}}

{{/* Backup and restore pods: called with (dict "uid" <the image's user>) */}}
{{- define "blockout.backup.pod" -}}
restartPolicy: Never
automountServiceAccountToken: false
securityContext:
  runAsNonRoot: true
  runAsUser: {{ .uid }}
  runAsGroup: {{ .uid }}
  fsGroup: {{ .uid }}
  seccompProfile: { type: RuntimeDefault }
{{- end }}
{{- define "blockout.backup.restricted" -}}
securityContext: { allowPrivilegeEscalation: false, readOnlyRootFilesystem: true, capabilities: { drop: [ALL] } }
{{- end }}
