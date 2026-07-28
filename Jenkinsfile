// ============================================
// DCloud Market - Unified Jenkins Pipeline
// Parallel Build & Deploy (Windows)
// ============================================

pipeline {
    agent none

    parameters {
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
        stage('Build & Deploy') {
            parallel {
                // ------------------------------------------
                // Backend: Python FastAPI
                // ------------------------------------------
                stage('Backend') {
                    agent none
                    environment {
                        REGISTRY = '10.10.11.194:1000'
                        IMAGE_NAME = 'dcloud-market-backend'
                        FULL_IMAGE = "${env.REGISTRY}/${env.IMAGE_NAME}"
                        BUILD_CONTEXT = '.\\backend'
                    }
                    stages {
                        stage('Backend - Checkout') {
                            agent { label "tengfei-test" }
                            steps {
                                checkout scm
                            }
                        }
                        stage('Backend - Build') {
                            agent { label "tengfei-test" }
                            steps {
                                script {
                                    def tag = params.TAG?.trim() ? params.TAG : "${env.BUILD_NUMBER}"
                                    env.IMAGE_WITH_TAG = "${env.FULL_IMAGE}:${tag}"
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
                            agent { label "tengfei-test" }
                            steps {
                                bat 'docker push %IMAGE_WITH_TAG%'
                                script {
                                    if (params.PUSH_LATEST) {
                                        bat 'docker push %FULL_IMAGE%:latest'
                                    }
                                }
                            }
                        }
                        stage('Backend - Deploy') {
                            agent { label "master" }
                            steps {
                                checkout scm
                                bat '''
                                    docker-compose -f docker-compose.registry.yml stop backend || echo no running service
                                    docker-compose -f docker-compose.registry.yml rm -f backend || echo no existing container
                                    docker-compose -f docker-compose.registry.yml pull backend
                                    docker-compose -f docker-compose.registry.yml up -d --remove-orphans backend
                                '''
                            }
                        }
                        stage('Backend - Cleanup') {
                            agent { label "tengfei-test" }
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
                    agent none
                    environment {
                        REGISTRY = '10.10.11.194:1000'
                        IMAGE_NAME = 'dcloud-market-frontend'
                        FULL_IMAGE = "${env.REGISTRY}/${env.IMAGE_NAME}"
                        BUILD_CONTEXT = '.\\frontend'
                    }
                    stages {
                        stage('Frontend - Checkout') {
                            agent { label "tengfei-test" }
                            steps {
                                checkout scm
                            }
                        }
                        stage('Frontend - Build') {
                            agent { label "tengfei-test" }
                            steps {
                                script {
                                    def tag = params.TAG?.trim() ? params.TAG : "${env.BUILD_NUMBER}"
                                    env.IMAGE_WITH_TAG = "${env.FULL_IMAGE}:${tag}"
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
                            agent { label "tengfei-test" }
                            steps {
                                bat 'docker push %IMAGE_WITH_TAG%'
                                script {
                                    if (params.PUSH_LATEST) {
                                        bat 'docker push %FULL_IMAGE%:latest'
                                    }
                                }
                            }
                        }
                        stage('Frontend - Deploy') {
                            agent { label "master" }
                            steps {
                                checkout scm
                                bat '''
                                    docker-compose -f docker-compose.registry.yml stop frontend || echo no running service
                                    docker-compose -f docker-compose.registry.yml rm -f frontend || echo no existing container
                                    docker-compose -f docker-compose.registry.yml pull frontend
                                    docker-compose -f docker-compose.registry.yml up -d --remove-orphans frontend
                                '''
                            }
                        }
                        stage('Frontend - Cleanup') {
                            agent { label "tengfei-test" }
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

    post {
        always {
            cleanWs()
        }
        failure {
            echo "Pipeline failed. Check build logs for details."
        }
    }
}
