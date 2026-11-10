# Start with di.iiii: from nothing to a saved space

> For a person who has never seen di. Mac or Linux, one terminal, no account. About one minute of typing and 45 seconds of waiting.

You need a terminal and `curl`. Nothing else has to be installed: the installer fetches what it needs into a folder named `.di` in your home folder. It asks for no password.

## Make a space on your own computer

1. Install di:

        curl -fsSL https://diiii.xyz/get | sh

   It ends with "open a new terminal first".

2. Open a new terminal, then check it:

        di --version

   It prints the version of di you installed. At the time of writing the newest released version is 0.4.3.

3. Start di.iiii:

        di up

   It prints an address, `http://localhost:4000`. Open it in your browser. If another program already uses port 4000, run `di up --port 4171` instead and use that port in the address.
   On a computer with no screen `di up` can end with an error about `xdg-open` after it says "is running". The server is running anyway. Use `di up --no-open` there.

4. Make a space:

        di new my-first-space

   It prints the address of your space, for example `http://localhost:4000/my-first-space`.
   If it says "Server storage is nearly full", the computer has less than 512 MB of free disk space. Free some, then run the command again.

5. Save the space as one file:

        di save my-first-space

   You get `my-first-space.diiii`. Any di.iiii opens it with `di open my-first-space.diiii`.

6. When you are done:

        di down

   Your work stays in the `.di` folder.

## Join someone else's space

The owner of a space sends you an invite link. Open it in a browser and sign in. Details: [Joining a space](https://diiii.xyz/wiki/joining-a-space).

## Let a terminal or an assistant act as you

This part needs `di login`, and the released version 0.4.3 does not have it: it answers `no such command: login`. The command is in the development version only, and no stable release has it yet. It needs a di newer than 0.4.3.

- Check what you have: `di --version`. If it prints 0.4.3, skip this part. Everything above works without signing in.
- When a newer stable release exists, `di update` fetches it. Then the steps are on [Connect your assistant](https://diiii.xyz/ai/setup.md).

## If something goes wrong

- `di: command not found`: you are in the terminal you installed from. Open a new one.
- `no such command: login`: your di is 0.4.3 or older, see above.
- Windows: the install line is in [Run di.iiii on your own machine](https://diiii.xyz/wiki/di-cli-local).
