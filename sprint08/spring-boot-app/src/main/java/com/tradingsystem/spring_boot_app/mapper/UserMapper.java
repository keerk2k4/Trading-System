package com.tradingsystem.spring_boot_app.mapper;

import com.tradingsystem.domain.entities.User;
import com.tradingsystem.domain.enums.UserStatus;
import org.apache.ibatis.annotations.*;

import java.util.List;
import java.util.Optional;

@Mapper
public interface UserMapper {

    @Insert("""
        INSERT INTO users (first_name, last_name, email, phone, password_hash, status, created_at, updated_at)
        VALUES (#{user.firstName}, #{user.lastName}, #{user.email}, #{user.phone}, #{user.passwordHash}, #{user.status}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        """)
    @Options(useGeneratedKeys = true, keyProperty = "user.userId")
    int insertUser(@Param("user") User user);

    @Select("""
        SELECT user_id, first_name, last_name, email, phone, password_hash, status
        FROM users
        WHERE user_id = #{userId}::uuid
        """)
    @Results({
        @Result(property = "userId", column = "user_id"),
        @Result(property = "firstName", column = "first_name"),
        @Result(property = "lastName", column = "last_name"),
        @Result(property = "passwordHash", column = "password_hash")
    })
    @ConstructorArgs({
        @Arg(column = "user_id", javaType = String.class),
        @Arg(column = "first_name", javaType = String.class),
        @Arg(column = "last_name", javaType = String.class),
        @Arg(column = "email", javaType = String.class),
        @Arg(column = "phone", javaType = String.class),
        @Arg(column = "password_hash", javaType = String.class),
        @Arg(column = "status", javaType = UserStatus.class)
    })
    Optional<User> findUserById(@Param("userId") String userId);

    @Select("""
        SELECT user_id, first_name, last_name, email, phone, password_hash, status
        FROM users
        WHERE email = #{email}
        """)
    @Results({
        @Result(property = "userId", column = "user_id"),
        @Result(property = "firstName", column = "first_name"),
        @Result(property = "lastName", column = "last_name"),
        @Result(property = "passwordHash", column = "password_hash")
    })
    Optional<User> findUserByEmail(@Param("email") String email);

    @Select("""
        SELECT user_id, first_name, last_name, email, phone, password_hash, status
        FROM users
        WHERE status = #{status}
        ORDER BY user_id
        """)
    @Results({
        @Result(property = "userId", column = "user_id"),
        @Result(property = "firstName", column = "first_name"),
        @Result(property = "lastName", column = "last_name"),
        @Result(property = "passwordHash", column = "password_hash")
    })
    List<User> findUsersByStatus(@Param("status") UserStatus status);

    @Update("""
        UPDATE users
        SET status = #{status}, updated_at = CURRENT_TIMESTAMP
        WHERE user_id = #{userId}::uuid
        """)
    int updateUserStatus(@Param("userId") String userId, @Param("status") UserStatus status);

    @Delete("""
        DELETE FROM users
        WHERE user_id = #{userId}::uuid
        """)
    int deleteUser(@Param("userId") String userId);

    @Select("SELECT COUNT(*) FROM users")
    int countUsers();
}