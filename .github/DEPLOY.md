# Deploy setup (Cloud Assistant, no SSH)

CI deploys to the Aliyun ECS box **without inbound SSH**. GitHub's runner calls
the Aliyun API; the Cloud Assistant agent already on the instance runs
`docker compose pull website && up -d website` locally. This avoids allowlisting
GitHub runner IPs in the security group (brittle, and not a real trust boundary)
and lets us **close public port 22**.

## One-time bootstrap (needs Aliyun console — CI cannot do this for you)

1. **Confirm the Cloud Assistant agent is running on the ECS instance.**
   Preinstalled on Alibaba Cloud public images since ~2017. Verify in the
   console (ECS → instance → "Cloud Assistant"), or install `aliyun-service`
   per the docs if missing.

2. **Create a least-privilege RAM user** and generate an AccessKey pair.
   Attach a custom policy:
   ```json
   {
     "Version": "1",
     "Statement": [
       { "Effect": "Allow",
         "Action": ["ecs:RunCommand", "ecs:DescribeInvocationResults"],
         "Resource": "*" }
     ]
   }
   ```

3. **Add four repo secrets** (Settings → Secrets and variables → Actions):
   | Secret | Value |
   | --- | --- |
   | `ALIYUN_ACCESS_KEY_ID` | RAM user AccessKey ID |
   | `ALIYUN_ACCESS_KEY_SECRET` | RAM user AccessKey secret |
   | `ALIYUN_REGION_ID` | region of the instance, e.g. `cn-hongkong` |
   | `ALIYUN_INSTANCE_ID` | the ECS instance id, `i-xxxxxxxx` |

4. **Merge this branch to `main`.** The next `feat/fix/refactor/chore` commit
   builds the image, pushes to GHCR, and deploys via Cloud Assistant.

5. **(Optional, recommended)** Once a deploy succeeds, remove the public
   inbound port-22 rule from the security group — it is no longer needed.

The old `VM_HOST` / `VM_USER` / `VM_SSH_KEY` secrets are unused now and can be
deleted.

## Note

The Aliyun `RunCommand` / `DescribeInvocationResults` parameter names and the
Base64 output encoding are based on the current API; confirm the first run's
logs and adjust if Alibaba has changed a field name.
