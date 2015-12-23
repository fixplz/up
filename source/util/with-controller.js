import Up from 'up'

export default async func => {
  let ctr
  try {
    ctr = await Up.getController()
    await func(ctr)
  }
  finally {
    if(ctr != null)
      ctr.close()
  }
}
