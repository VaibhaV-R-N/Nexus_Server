const express = require("express")
const {Server} = require("socket.io")
const cors = require("cors")


const app = express();

app.use(cors())

let Rooms = []

const getNewRoom=(id,password)=>{
    return {
        id,
        password,
        messages:[],
        users:[]
    }
}



const getNewMessage = (username,content,color,file)=>{
    return {
        username,
        content,
        color,
        
        file:file || undefined
    }
}

const  getNewUser = (username,id,color,publicKey)=>{
    return {
        username,
        id,
        color,
    }
}

const publicRoom = getNewRoom("public","public")
Rooms.push(publicRoom)

const addMessageToRoom = (roomId,message)=>{
    Rooms = Rooms.map((room)=>{
        if(room.id === roomId){
            if(room.messages.length >= 5)
                room.messages.shift()
            room.messages.push(message)
        }
        return room
    })
}

const addUserToRoom = (roomId,user)=>{
    Rooms = Rooms.map((room)=>{
        if(room.id === roomId){
            
            room.users.push(user)
        }
        return room
    })
}

const userNameExists = (username)=>{
    let exists = false
    if(username.trim() === "Server"){
        return false
    }
    Rooms.forEach(room=>{
        room.users.forEach(user=>{
            if (user.username === username){
                exists = true
            }
                
        })
    })
    return exists
}

const expressServer = app.listen(4000,()=>{
    console.log("listening at port 4000...");
})

const io = new Server(expressServer,{
    cors:{
        origins:["*"]
    },
    maxHttpBufferSize:5e6
})

io.on("connection",(socket)=>{
    console.log(`socket of id: ${socket.id} has connected...`);
    
    socket.on("createRoom",(data,callBack)=>{
        const {roomId} = data
        const {password} = data
        const {username} = data
        const {color} = data

        if(roomId==="" || password ===""){
            callBack({error:"RoomId or Password cannot be empty"})
        }
        else{
            const room = Rooms.find((room)=>room.id === roomId)
            if(!room){
                const NewRoom = getNewRoom(roomId,password)
                NewRoom.users.push(getNewUser(username,socket.id,color))
                const newMessage = getNewMessage('Server',`${username || 'unknown'} has created the room '${roomId}'! ✨`)
                Rooms.push(NewRoom)
                socket.join(roomId)
                io.to(roomId).emit("fromServer",{messages:newMessage,roomId,password})
                callBack({ok:true})
            }else{
                callBack({error:"room already exists!"})
            }
        }
        

    })

    socket.on("joinRoom",(data,callBack)=>{
        const {roomId} = data
        const {password} = data
        const {username} = data

        const {color} = data
        const {newuser} = data

        if(username.trim() === ""){
            callBack({error:"Username cannot be empty!"})
        }
        else if(userNameExists(username) && newuser){
            callBack({error:"Username is taken!"})
        }
        else{
            if(roomId === "public"){
                socket.join("public")
                addUserToRoom("public",getNewUser(username,socket.id,color))
                addMessageToRoom("public",getNewMessage("Server",`${username || "unknown"} has joined the room '${roomId}' ! ✨`,color))
                const publicRoom = Rooms.find((room)=>room.id ==="public")
                const messages = publicRoom.messages
                io.to(roomId).emit("fromServer",{messages,roomId,password})
                callBack({ok:true})
            }
            else{
                let room = Rooms.find((room)=>room.id === roomId)
                if(room){
                    const user = room.users.find((user)=>user.username === username)
                    if(!user){
                        if(room.password === password){
                            socket.join(roomId)
                            addUserToRoom(roomId,getNewUser(username,socket.id,color))
                            const newMessage = getNewMessage("Server",`${username || "unknown"} has joined the room '${roomId}' ! ✨`,color)
               
                            io.to(roomId).emit("fromServer",{messages:newMessage,roomId,password})
                            callBack({ok:true})
                        }else{
                            callBack({error:"roomId or password is wrong."})
                        }
                    }else{
                        callBack({error:"you already have joined the room"})
                    }
                    
                }else{
                    callBack({error:"roomId or password is wrong."})
                }
                
            }
        }

    })

    socket.on("fromClient",(data)=>{
        const {roomId} = data
        const {message} = data

        let password,contextroom
        if(message.content){
            const newMessage = getNewMessage(message.username,message.content,message.color,message.file)
            Rooms.forEach((room)=>{
                if(room.id === roomId){
                    password = room.password
                  
                    contextroom = room
                }
            })
            if(roomId === "public"){
                addMessageToRoom("public",newMessage)
                Rooms.forEach((room)=>{
                    if(room.id === roomId){
                        contextroom = room
                    }
                })
                io.to(roomId).emit("fromServer",{messages:contextroom.messages,roomId,password})
            }else{
                io.to(roomId).emit("fromServer",{messages:newMessage,roomId,password})
            }
                        
        }
        
    })

    socket.on("leaveRoom",(data)=>{
        const {roomId,username} = data
        let messages,pass
        Rooms = Rooms.map((room)=>{
            if(room.id === roomId ){
                room.users = room.users.filter((user)=>{
                   return user.username !== username
                })
                if(roomId === "public"){
                    room.messages.push(getNewMessage("Server",`${username || "unknown"} has left the room...🚪`,"#000000"))
                    messages = room.messages
                }else{
                    const newMessage = getNewMessage("Server",`${username || "unknown"} has left the room...🚪`,"#000000")
                    messages = newMessage
                }
                
                pass = room.password
            }
            return room
        })

        socket.leave(roomId)

        io.to(roomId).emit("fromServer",{messages:messages,roomId,password:pass})

        const public = Rooms.find(room=>room.id === "public")

        Rooms = Rooms.filter(room=>{
             return room.users.length!==0
        })

        const foundpublic = Rooms.find(room=>room.id === "public")
        if(!foundpublic)
            Rooms.push(public)
    })

    socket.on("disconnect",()=>{
        
        let username
        const userRooms = []
        Rooms = Rooms.map((room)=>{
            if(room){
                room.users = room.users.map((user)=>{
                    if(user){
                   
                        if(user.id === socket.id){

                            username = user.username
                            userRooms.push(room.id)
                            socket.leave(room.id)
                        }else{
                            return user
                        }
                    }
                }).filter((user)=>user!==undefined)
                return room
            }
        }).filter((room)=>room!==undefined)

        userRooms.forEach(roomId=>{

            if(roomId==="public"){
                addMessageToRoom(roomId,getNewMessage("Server",`${username} has left the room...🚪`,"#000000"))
                const room = Rooms.find((room)=>{
                    return room.id === roomId
                })
                if(room){
                    io.to(roomId).emit("fromServer",{messages:room.messages,roomId,password:room.password})
                }
            }else{
                const newMessage = getNewMessage("Server",`${username} has left the room...🚪`,"#000000")
                const room = Rooms.find((room)=>{
                    return room.id === roomId
                })
                if(room){
                    io.to(roomId).emit("fromServer",{messages:newMessage,roomId,password:room.password})
                }
            }

            
            
        })
        const public = Rooms.find(room=>room.id === "public")

        Rooms = Rooms.filter(room=>{
             return room.users.length!==0
        })

        const foundpublic = Rooms.find(room=>room.id === "public")
        if(!foundpublic)
            Rooms.push(public)
    })

})
