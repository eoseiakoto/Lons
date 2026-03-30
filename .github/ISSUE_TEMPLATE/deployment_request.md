---
name: Deployment Request
about: Request a deployment to a specific environment
title: '[DEPLOY] '
labels: deployment
assignees: eoseiakoto
---

## Target Environment
- [ ] Staging
- [ ] Pre-production
- [ ] Production

## Release Version / Commit
<!-- Git tag, branch, or commit SHA to deploy -->

## Changes Included
<!-- Summary of what's being deployed -->

## Pre-Deployment Checklist
- [ ] All CI checks pass on the target branch
- [ ] Integration tests pass in the previous environment
- [ ] Database migration tested (if applicable)
- [ ] Rollback plan documented
- [ ] 48-hour tenant notice sent (if production maintenance window)

## Deployment Window
<!-- Preferred time, or "next available" -->

## Risk Assessment
- [ ] Low — No data model changes, no financial logic changes
- [ ] Medium — Contains data model changes or new integrations
- [ ] High — Contains financial calculation changes or breaking API changes

## Rollback Plan
<!-- How to rollback if something goes wrong -->
