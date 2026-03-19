import Dockerode from 'dockerode';

const docker = new Dockerode({ socketPath: '/var/run/docker.sock' });

export async function listContainers(): Promise<Dockerode.ContainerInfo[]> {
  return docker.listContainers({ all: true });
}

export async function getContainerLogs(containerId: string, tail: number = 100): Promise<string> {
  const container = docker.getContainer(containerId);
  const logs = await container.logs({ stdout: true, stderr: true, tail, timestamps: true });
  return logs.toString();
}

export async function stopContainer(containerId: string): Promise<void> {
  const container = docker.getContainer(containerId);
  await container.stop();
}

export async function startContainer(containerId: string): Promise<void> {
  const container = docker.getContainer(containerId);
  await container.start();
}

export async function removeContainer(containerId: string, force = false): Promise<void> {
  const container = docker.getContainer(containerId);
  await container.remove({ force });
}

export async function getDockerInfo(): Promise<any> {
  try {
    return await docker.info();
  } catch {
    return null;
  }
}

export { docker };
