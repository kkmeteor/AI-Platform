// ============================================
// DCloud Market - Unified Jenkins Pipeline
// Parallel Build & Deploy (Windows)
//
// Frontend & backend live in the same git repo,
// so the code is checked out only once per phase:
//   Phase 1 (tengfei-test): checkout once, then
//     build & push backend/frontend in parallel
//   Phase 2 (master):       checkout once, then
//     deploy both containers in parallel
// Nested stages without their own agent run in
// the workspace of the enclosing agented stage,
// so both parallel branches see the checkout.
// ============================================

pipeline {
    agent none

    parameters {
        choice(
            name: 'RUN_MODE',
            choices: ['full', 'build-push', 'deploy-only'],
            description: 'full: build, push, deploy and cleanup; build-push: build and push images only; deploy-only: pull and deploy images only (images must already be pushed)'
        )
        booleanParam(
            name: 'PUSH_LATEST',
            defaultValue: true,
            description: 'Whether to also push the "latest" tag'
        )
        string(
            name: 'TAG',
            defaultValue: '',
            description: 'Custom image tag (leave empty to use BUILD_NUMBER)'
        )
    }

    stages {
        // ==========================================
        // Phase 1: checkout once, build & push images
        // ==========================================
        stage('Build & Push') {
            when {
                beforeAgent true
                expression { params.RUN_MODE != 'deploy-only' }
            }
            agent { label "tengfei-test" }
            stages {
                stage('Checkout') {
                    steps {
                        checkout scm
                    }
                }
                stage('Build Images') {
                    parallel {
                        // ------------------------------------------
                        // Backend: Python FastAPI
                        // ------------------------------------------
                        stage('Backend') {
                            environment {
                                REGISTRY = '10.10.11.194:1000'
                                IMAGE_NAME = 'dcloud-market-backend'
                                FULL_IMAGE = "${env.REGISTRY}/${env.IMAGE_NAME}"
                                // Keep branch-scoped: script-level env writes race across parallel branches
                                IMAGE_WITH_TAG = "${env.REGISTRY}/${env.IMAGE_NAME}:${params.TAG?.trim() ?: env.BUILD_NUMBER}"
                                BUILD_CONTEXT = '.\\backend'
                            }
                            stages {
                                stage('Backend - Build') {
                                    steps {
                                        script {
                                            def tags = "-t ${env.IMAGE_WITH_TAG}"
                                            if (params.PUSH_LATEST) {
                                                tags += " -t ${env.FULL_IMAGE}:latest"
                                            }
                                            echo "Building: ${env.IMAGE_WITH_TAG}"
                                            bat "docker build ${tags} -f ${env.BUILD_CONTEXT}\\Dockerfile ${env.BUILD_CONTEXT}"
                                        }
                                    }
                                }
                                stage('Backend - Push') {
                                    steps {
                                        echo "Pushing: ${env.IMAGE_WITH_TAG}"
                                        bat 'docker push %IMAGE_WITH_TAG%'
                                        script {
                                            if (params.PUSH_LATEST) {
                                                bat 'docker push %FULL_IMAGE%:latest'
                                            }
                                        }
                                    }
                                }
                                stage('Backend - Cleanup') {
                                    steps {
                                        bat '''
                                            docker rmi %IMAGE_WITH_TAG% 2>nul || echo cleanup skipped
                                            docker rmi %FULL_IMAGE%:latest 2>nul || echo cleanup skipped
                                        '''
                                    }
                                }
                            }
                        }

                        // ------------------------------------------
                        // Frontend: React + Vite + Nginx
                        // ------------------------------------------
                        stage('Frontend') {
                            environment {
                                REGISTRY = '10.10.11.194:1000'
                                IMAGE_NAME = 'dcloud-market-frontend'
                                FULL_IMAGE = "${env.REGISTRY}/${env.IMAGE_NAME}"
                                // Keep branch-scoped: script-level env writes race across parallel branches
                                IMAGE_WITH_TAG = "${env.REGISTRY}/${env.IMAGE_NAME}:${params.TAG?.trim() ?: env.BUILD_NUMBER}"
                                BUILD_CONTEXT = '.\\frontend'
                            }
                            stages {
                                stage('Frontend - Build') {
                                    steps {
                                        script {
                                            def tags = "-t ${env.IMAGE_WITH_TAG}"
                                            if (params.PUSH_LATEST) {
                                                tags += " -t ${env.FULL_IMAGE}:latest"
                                            }
                                            echo "Building: ${env.IMAGE_WITH_TAG}"
                                            bat "docker build ${tags} -f ${env.BUILD_CONTEXT}\\Dockerfile ${env.BUILD_CONTEXT}"
                                        }
                                    }
                                }
                                stage('Frontend - Push') {
                                    steps {
                                        echo "Pushing: ${env.IMAGE_WITH_TAG}"
                                        bat 'docker push %IMAGE_WITH_TAG%'
                                        script {
                                            if (params.PUSH_LATEST) {
                                                bat 'docker push %FULL_IMAGE%:latest'
                                            }
                                        }
                                    }
                                }
                                stage('Frontend - Cleanup') {
                                    steps {
                                        bat '''
                                            docker rmi %IMAGE_WITH_TAG% 2>nul || echo cleanup skipped
                                            docker rmi %FULL_IMAGE%:latest 2>nul || echo cleanup skipped
                                        '''
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        // ==========================================
        // Phase 2: checkout once on deploy host,
        // then deploy both containers in parallel
        // ==========================================
        stage('Deploy') {
            when {
                beforeAgent true
                expression { params.RUN_MODE != 'build-push' }
            }
            agent { label "master" }
            stages {
                stage('Checkout') {
                    steps {
                        checkout scm
                    }
                }
                stage('Deploy Services') {
                    parallel {
                        stage('Backend - Deploy') {
                            steps {
                                bat '''
                                    if not exist "C:/Data/config" mkdir "C:/Data/config"
                                    copy /Y "config/config.json" "C:/Data/config/config.json"
                                    docker stop dcloud-market-backend 2>nul || echo no running container
                                    docker rm -f dcloud-market-backend 2>nul || echo no existing container
                                    docker-compose -p dcloud-market -f scripts/deploy/docker-compose.registry.yml pull backend
                                    docker-compose -p dcloud-market -f scripts/deploy/docker-compose.registry.yml up -d --no-deps --remove-orphans backend
                                '''
                            }
                        }
                        stage('Frontend - Deploy') {
                            steps {
                                bat '''
                                    if not exist "C:/Data/config" mkdir "C:/Data/config"
                                    copy /Y "config/config.json" "C:/Data/config/config.json"
                                    docker stop dcloud-market-frontend 2>nul || echo no running container
                                    docker rm -f dcloud-market-frontend 2>nul || echo no existing container
                                    docker-compose -p dcloud-market -f scripts/deploy/docker-compose.registry.yml pull frontend
                                    docker-compose -p dcloud-market -f scripts/deploy/docker-compose.registry.yml up -d --no-deps --remove-orphans frontend
                                '''
                            }
                        }
                    }
                }
            }
        }
    }

    post {
        always {
            node('tengfei-test') {
                cleanWs()
            }
        }
        failure {
            echo "Pipeline failed. Check build logs for details."
        }
    }
}
